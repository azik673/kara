import fs from 'fs';
const content = fs.readFileSync('.env.local', 'utf8');
content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && trimmed.includes('=')) {
        const [key, ...rest] = trimmed.split('=');
        const value = rest.join('=');
        console.log(`${key} length: ${value.length}`);
    }
});
