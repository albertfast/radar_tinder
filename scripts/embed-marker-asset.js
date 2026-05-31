const fs = require('fs');
const path = require('path');

const pngPath = path.join(__dirname, '../assets/markers/speed_camera_3d.png');
const outPath = path.join(__dirname, '../src/mapflow-navigation-kit/src/utils/mapMarkerAssets.ts');

const b64 = fs.readFileSync(pngPath).toString('base64');
const content = `/** Speed camera map marker (3D PNG, embedded for WebView). */\nexport const SPEED_CAMERA_MARKER_DATA_URI = 'data:image/png;base64,${b64}';\n`;

fs.writeFileSync(outPath, content);
console.log('Wrote', outPath, 'png bytes', fs.statSync(pngPath).size);
