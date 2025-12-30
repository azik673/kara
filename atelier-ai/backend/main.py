import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import base64
import io
from PIL import Image, ImageDraw
import time
import numpy as np
from scipy.interpolate import Rbf
from scipy.ndimage import map_coordinates
import logging

# Configure Logging
logging.basicConfig(filename='backend_debug.log', level=logging.INFO, format='%(asctime)s - %(message)s')

# Initialize FastAPI app
app = FastAPI(title="Atelier AI - Drag Engine")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Allow frontend origin
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)

# Data Models
class Point(BaseModel):
    x: float
    y: float

class DragRequest(BaseModel):
    image: str  # Base64 encoded image
    points: List[List[Point]]  # List of pairs [handle, target]
    mask: str = None # Optional mask for protected areas

class DragResponse(BaseModel):
    image: str
    status: str

# Helper: Thin Plate Spline Warping
def warp_image_tps(img, source_points, target_points):
    """
    Warps an image using Thin Plate Spline (TPS) interpolation.
    """
    src_x = [p.x for p in source_points]
    src_y = [p.y for p in source_points]
    dst_x = [p.x for p in target_points]
    dst_y = [p.y for p in target_points]

    # Calculate max displacement for logging
    displacements = [np.sqrt((sx-dx)**2 + (sy-dy)**2) for sx, sy, dx, dy in zip(src_x, src_y, dst_x, dst_y)]
    max_disp = max(displacements) if displacements else 0
    logging.info(f"Max point displacement: {max_disp:.2f}px")

    # Convert image to numpy array
    img_array = np.array(img)
    h, w, c = img_array.shape

    # Add corner points to anchor the image (prevent global distortion)
    corners = [(0, 0), (0, h), (w, 0), (w, h)]
    for cx, cy in corners:
        src_x.append(cx)
        src_y.append(cy)
        dst_x.append(cx)
        dst_y.append(cy)

    # Add a grid of anchor points to localize the warp
    # 10x10 grid provides strong stability
    grid_size = 10
    exclusion_radius = 100 # pixels
    
    for i in range(grid_size + 1):
        for j in range(grid_size + 1):
            ax = (w * i) / grid_size
            ay = (h * j) / grid_size
            
            # Only add anchor if it's NOT too close to any user source point
            # This allows the area around the drag point to move freely
            is_near_user_point = any(np.sqrt((ax-px)**2 + (ay-py)**2) < exclusion_radius for px, py in zip(src_x, src_y))
            
            if not is_near_user_point:
                src_x.append(ax)
                src_y.append(ay)
                dst_x.append(ax)
                dst_y.append(ay)

    try:
        # smooth=0 forces the warp to pass EXACTLY through the points
        rbf_x = Rbf(dst_x, dst_y, src_x, function='thin_plate', smooth=0)
        rbf_y = Rbf(dst_x, dst_y, src_y, function='thin_plate', smooth=0)
    except Exception as e:
        logging.error(f"Rbf initialization failed: {e}")
        return img

    grid_y, grid_x = np.mgrid[0:h, 0:w]
    map_x = rbf_x(grid_x.ravel(), grid_y.ravel()).reshape(h, w)
    map_y = rbf_y(grid_x.ravel(), grid_y.ravel()).reshape(h, w)

    map_x = np.clip(map_x, 0, w - 1)
    map_y = np.clip(map_y, 0, h - 1)

    warped_channels = []
    for i in range(c):
        warped_channels.append(map_coordinates(img_array[:,:,i], [map_y, map_x], order=1, mode='nearest'))
    
    warped_img_np = np.stack(warped_channels, axis=2)
    return Image.fromarray(warped_img_np.astype(np.uint8))

@app.get("/")
def read_root():
    return {"status": "online", "message": "Atelier AI Backend is running"}

@app.post("/drag", response_model=DragResponse)
async def process_drag(request: DragRequest):
    logging.info(f"Received drag request with {len(request.points)} point pairs")
    print(f"Received drag request with {len(request.points)} point pairs")
    
    try:
        # 1. Decode Image
        image_data = base64.b64decode(request.image.split(",")[1])
        img = Image.open(io.BytesIO(image_data)).convert("RGB")
        logging.info(f"Image decoded. Size: {img.size}")
        
        # 2. Process Points
        handles = [pair[0] for pair in request.points]
        targets = [pair[1] for pair in request.points]
        
        # Log points
        for i, (h, t) in enumerate(zip(handles, targets)):
            logging.info(f"Point {i}: Handle({h.x}, {h.y}) -> Target({t.x}, {t.y})")

        # Check if any points actually moved
        has_movement = False
        for h, t in zip(handles, targets):
            if abs(h.x - t.x) > 1 or abs(h.y - t.y) > 1:
                has_movement = True
                break
        
        if not has_movement:
            logging.warning("No movement detected (threshold 1px)")
            print("No movement detected, returning original image")
            return {
                "image": request.image,
                "status": "success"
            }

        # 3. Apply Warping
        print("Applying TPS warping...")
        logging.info("Applying TPS warping...")
        start_time = time.time()
        warped_img = warp_image_tps(img, handles, targets)
        logging.info(f"Warping completed in {time.time() - start_time:.2f}s")
        print(f"Warping completed in {time.time() - start_time:.2f}s")

        # 4. Encode Response
        buffered = io.BytesIO()
        warped_img.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
        
        return {
            "image": f"data:image/png;base64,{img_str}",
            "status": "success"
        }

    except Exception as e:
        logging.error(f"Error processing drag: {e}")
        print(f"Error processing drag: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

class DetectRequest(BaseModel):
    image: str

class DetectedPoint(BaseModel):
    x: float
    y: float
    label: str

class DetectResponse(BaseModel):
    points: List[DetectedPoint]
    status: str

@app.post("/detect", response_model=DetectResponse)
async def detect_points(request: DetectRequest):
    print("Received detection request")
    try:
        # 1. Decode Image (to get dimensions)
        image_data = base64.b64decode(request.image.split(",")[1])
        img = Image.open(io.BytesIO(image_data))
        width, height = img.size
        
        # 2. Simulate Detection (Mock Points)
        # In a real app, run a pose estimation model here.
        # We'll return points relative to image size.
        
        points = [
            DetectedPoint(x=width * 0.5, y=height * 0.2, label="Head"),
            DetectedPoint(x=width * 0.5, y=height * 0.3, label="Neck"),
            DetectedPoint(x=width * 0.3, y=height * 0.4, label="Left Shoulder"),
            DetectedPoint(x=width * 0.7, y=height * 0.4, label="Right Shoulder"),
            DetectedPoint(x=width * 0.2, y=height * 0.6, label="Left Hand"),
            DetectedPoint(x=width * 0.8, y=height * 0.6, label="Right Hand"),
        ]
        
        return {
            "points": points,
            "status": "success"
        }
    except Exception as e:
        print(f"Error detecting points: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    # Run with: python main.py
    uvicorn.run(app, host="0.0.0.0", port=8000)
