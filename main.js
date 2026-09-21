const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig() {
  const defaults = { theme: 'dark', temperatureUnit: 'celsius', windowX: null, windowY: null };
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf8');
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

function saveConfig(config) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
}

function createWindow() {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.bounds;
  const config = loadConfig();

  const x = config.windowX ?? Math.floor(width / 2) - 260;
  const y = config.windowY ?? 20;

  mainWindow = new BrowserWindow({
    width: 520,
    height: 280,
    minWidth: 520,
    minHeight: 280,
    maxWidth: 520,
    maxHeight: 280,
    x,
    y,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    roundedCorners: true,
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.on('moved', () => {
    const [winX, winY] = mainWindow.getPosition();
    const cfg = loadConfig();
    saveConfig({ ...cfg, windowX: winX, windowY: winY });
  });
}

ipcMain.handle('get-config', () => loadConfig());

ipcMain.handle('set-config', (_event, patch) => {
  const config = { ...loadConfig(), ...patch };
  saveConfig(config);
  mainWindow.webContents.send('config-changed', config);
  return config;
});

ipcMain.handle('show-context-menu', () => {
  const config = loadConfig();

  const themes = [
    { id: 'dark',   label: 'Dark'   },
    { id: 'glass',  label: 'Glass'  },
    { id: 'neon',   label: 'Neon'   },
    { id: 'light',  label: 'Light'  },
    { id: 'nord',   label: 'Nord'   },
    { id: 'aurora', label: 'Aurora' },
  ];

  const menu = Menu.buildFromTemplate([
    {
      label: 'Theme',
      submenu: themes.map(({ id, label }) => ({
        label,
        type: 'radio',
        checked: config.theme === id,
        click: () => {
          const updated = { ...config, theme: id };
          saveConfig(updated);
          mainWindow.webContents.send('config-changed', updated);
        },
      })),
    },
    {
      label: 'Temperature Unit',
      submenu: [
        {
          label: 'Celsius (°C)',
          type: 'radio',
          checked: config.temperatureUnit === 'celsius',
          click: () => {
            const updated = { ...config, temperatureUnit: 'celsius' };
            saveConfig(updated);
            mainWindow.webContents.send('config-changed', updated);
          },
        },
        {
          label: 'Fahrenheit (°F)',
          type: 'radio',
          checked: config.temperatureUnit === 'fahrenheit',
          click: () => {
            const updated = { ...config, temperatureUnit: 'fahrenheit' };
            saveConfig(updated);
            mainWindow.webContents.send('config-changed', updated);
          },
        },
      ],
    },
    { type: 'separator' },
    {
      label: 'Launch at Startup',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked });
      },
    },
    { type: 'separator' },
    { label: 'Quit Oasis', click: () => app.quit() },
  ]);

  menu.popup({ window: mainWindow });
});

ipcMain.handle('get-weather', async () => {
  try {
    const fetch = (await import('node-fetch')).default;

    const geoRes = await fetch('https://ip-api.com/json/');
    const geo = await geoRes.json();

    if (geo.status !== 'success') return null;

    const { lat, lon, city } = geo;

    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,weathercode,relativehumidity_2m,windspeed_10m,is_day` +
      `&temperature_unit=celsius&windspeed_unit=kmh`
    );
    const weather = await weatherRes.json();

    const cur = weather.current;
    const temp     = Math.round(cur.temperature_2m);
    const feelsLike = Math.round(cur.apparent_temperature);
    const humidity  = cur.relativehumidity_2m;
    const windSpeed = Math.round(cur.windspeed_10m);
    const isDay     = cur.is_day === 1;
    const category  = weatherCodeToCategory(cur.weathercode);

    return { temp, feelsLike, category, city, humidity, windSpeed, isDay };
  } catch (error) {
    console.error('Error fetching weather:', error);
    return null;
  }
});

function weatherCodeToCategory(code) {
  if (code === 0)  return 'clear';
  if (code <= 2)   return 'partly-cloudy';
  if (code === 3)  return 'cloudy';
  if (code <= 49)  return 'fog';
  if (code <= 67)  return 'rain';
  if (code <= 77)  return 'snow';
  if (code <= 82)  return 'rain';
  if (code <= 86)  return 'snow';
  if (code <= 99)  return 'thunderstorm';
  return 'clear';
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
