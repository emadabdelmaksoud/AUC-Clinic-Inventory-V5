import { app, BrowserWindow, shell, Menu, dialog } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development";

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    title: "Store Control",
    icon: path.join(__dirname, "..", "public", "icon.ico"),
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    show: false,
    titleBarStyle: "default",
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, "..", "dist", "public", "index.html");
    mainWindow.loadFile(indexPath);
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  buildMenu();
}

function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        { label: "Reload", accelerator: "CmdOrCtrl+R", click: () => mainWindow?.reload() },
        { type: "separator" },
        { label: "Quit Store Control", accelerator: "Alt+F4", role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Toggle Fullscreen", accelerator: "F11", role: "togglefullscreen" },
        { label: "Zoom In", accelerator: "CmdOrCtrl+Plus", role: "zoomin" },
        { label: "Zoom Out", accelerator: "CmdOrCtrl+-", role: "zoomout" },
        { label: "Reset Zoom", accelerator: "CmdOrCtrl+0", role: "resetzoom" },
        { type: "separator" },
        ...(isDev
          ? [{ label: "Dev Tools", accelerator: "F12", click: () => mainWindow?.webContents.toggleDevTools() }]
          : []),
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About Store Control",
          click: () => {
            dialog.showMessageBox(mainWindow, {
              title: "About Store Control",
              message: "Store Control",
              detail:
                "Offline Inventory & Clinic Store Management\n\nAll data is stored locally on this device.\nDefault login: admin / admin123",
              buttons: ["OK"],
              icon: path.join(__dirname, "..", "public", "icon.ico"),
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
