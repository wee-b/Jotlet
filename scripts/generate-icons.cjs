// Render the editable vector with Electron, then emit native app icon formats.
const { app, BrowserWindow, nativeImage } = require('electron');
const { readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
app.disableHardwareAcceleration();

app
  .whenReady()
  .then(async () => {
    const assets = path.resolve(__dirname, '../assets');
    const svg = await readFile(path.join(assets, 'jotlet.svg'), 'utf8');
    const window = new BrowserWindow({
      width: 1024,
      height: 1024,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: { offscreen: true, backgroundThrottling: false },
    });
    await window.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        `<style>html,body{margin:0;width:100%;height:100%;background:transparent}svg{display:block;width:100%;height:100%}</style>${svg}`,
      )}`,
    );
    const dataUrl = await window.webContents.executeJavaScript(`(async () => {
    const image = new Image();
    image.src = 'data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}';
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1024;
    canvas.getContext('2d').drawImage(image, 0, 0, 1024, 1024);
    return canvas.toDataURL('image/png');
  })()`);
    const master = nativeImage.createFromDataURL(dataUrl);
    if (master.isEmpty())
      throw new Error('Icon rendering returned an empty image.');
    const png = (size) =>
      master.resize({ width: size, height: size, quality: 'best' }).toPNG();
    await writeFile(path.join(assets, 'jotlet.png'), png(512));

    const sizes = [16, 24, 32, 48, 64, 128, 256];
    const images = sizes.map(png);
    const header = Buffer.alloc(6 + 16 * sizes.length);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(sizes.length, 4);
    let offset = header.length;
    sizes.forEach((size, index) => {
      const entry = 6 + 16 * index;
      header[entry] = header[entry + 1] = size === 256 ? 0 : size;
      header.writeUInt16LE(1, entry + 4);
      header.writeUInt16LE(32, entry + 6);
      header.writeUInt32LE(images[index].length, entry + 8);
      header.writeUInt32LE(offset, entry + 12);
      offset += images[index].length;
    });
    await writeFile(
      path.join(assets, 'jotlet.ico'),
      Buffer.concat([header, ...images]),
    );

    const chunks = [
      [16, 'icp4'],
      [32, 'icp5'],
      [64, 'icp6'],
      [128, 'ic07'],
      [256, 'ic08'],
      [512, 'ic09'],
      [1024, 'ic10'],
    ].map(([size, type]) => {
      const data = png(size);
      const chunk = Buffer.alloc(8);
      chunk.write(type);
      chunk.writeUInt32BE(data.length + 8, 4);
      return Buffer.concat([chunk, data]);
    });
    const icns = Buffer.alloc(8);
    icns.write('icns');
    icns.writeUInt32BE(
      8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0),
      4,
    );
    await writeFile(
      path.join(assets, 'jotlet.icns'),
      Buffer.concat([icns, ...chunks]),
    );
    console.log('Generated Jotlet PNG, ICO (7 sizes), and ICNS icons.');
    window.destroy();
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
