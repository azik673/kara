# Atelier AI - Backend Engine

This folder contains the Python backend required to run advanced AI features like "DragGAN" / "DragDiffusion".

## Setup Instructions

1.  **Install Python 3.10+**
    Make sure you have Python installed. You can download it from [python.org](https://www.python.org/downloads/).

2.  **Install Dependencies**
    Open a terminal in this folder (`backend/`) and run:
    ```bash
    pip install -r requirements.txt
    ```

3.  **Run the Server**
    Start the server by running:
    ```bash
    python main.py
    ```
    The server will start at `http://localhost:8000`.

## Integrating Real Models

The current `main.py` is a **simulator**. It accepts the points and draws them on the image to prove the connection works.

To use **DragGAN** or **DragDiffusion**:
1.  Clone the official repository (e.g., [DragGAN](https://github.com/XingangPan/DragGAN)).
2.  Install their specific dependencies (PyTorch with CUDA).
3.  Update `main.py` to import their model and replace the simulation logic in `process_drag` with the actual inference call.
