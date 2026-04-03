const express = require("express");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const cors = require("cors");
const FormData = require("form-data");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const PORT = 3000;

// CONFIG CLOUDINARY
const CLOUD_NAME = "ISI_CLOUD_NAME";
const UPLOAD_PRESET = "ISI_UPLOAD_PRESET";

// DB PATH
const FILE_DB = "./db/files.json";
const USER_DB = "./db/users.json";
const FOLDER_DB = "./db/folders.json";

// INIT FILE
[FILE_DB, USER_DB, FOLDER_DB].forEach(path => {
    if (!fs.existsSync(path)) fs.writeFileSync(path, "[]");
});

// HELPER
const readJSON = (p) => JSON.parse(fs.readFileSync(p));
const writeJSON = (p, d) => fs.writeFileSync(p, JSON.stringify(d, null, 2));
const genId = () => Math.random().toString(36).substring(2, 10);

// ================= AUTH =================
app.post("/auth", async (req, res) => {
    const { domain, api_key } = req.body;

    try {
        const response = await axios.get(`${domain}/api/client`, {
            headers: {
                Authorization: `Bearer ${api_key}`,
                Accept: "application/json"
            }
        });

        let users = readJSON(USER_DB);
        let user = users.find(u => u.api_key === api_key);

        if (!user) {
            user = {
                id: genId(),
                domain,
                api_key,
                username: response.data.attributes.username,
                root_folder: "root_" + genId()
            };

            users.push(user);
            writeJSON(USER_DB, users);

            let folders = readJSON(FOLDER_DB);
            folders.push({
                id: user.root_folder,
                userId: user.id,
                name: "My Drive",
                parentId: null
            });
            writeJSON(FOLDER_DB, folders);
        }

        res.json({ success: true, user });

    } catch {
        res.status(401).json({ success: false });
    }
});

// ================= UPLOAD =================
const upload = multer({ storage: multer.memoryStorage() });

app.post("/upload", upload.single("file"), async (req, res) => {
    const userId = req.headers["x-user-id"];

    try {
        const form = new FormData();
        form.append("file", req.file.buffer.toString("base64"));
        form.append("upload_preset", UPLOAD_PRESET);

        const r = await axios.post(
            `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
            form,
            { headers: form.getHeaders() }
        );

        const id = genId();

        let files = readJSON(FILE_DB);
        files.push({
            id,
            userId,
            name: req.file.originalname,
            url: r.data.secure_url,
            public_id: r.data.public_id,
            folderId: req.body.folderId
        });

        writeJSON(FILE_DB, files);

        res.json({ url: `/file/${id}` });

    } catch (e) {
        console.error(e);
        res.status(500).send("upload error");
    }
});

// ================= FILE =================
app.get("/file/:id", async (req, res) => {
    const files = readJSON(FILE_DB);
    const file = files.find(f => f.id === req.params.id);

    if (!file) return res.sendStatus(404);

    const r = await axios.get(file.url, { responseType: "stream" });
    r.data.pipe(res);
});

// ================= FOLDER =================
app.get("/folder/:id", (req, res) => {
    const userId = req.headers["x-user-id"];

    const files = readJSON(FILE_DB).filter(f => f.userId === userId && f.folderId === req.params.id);
    const folders = readJSON(FOLDER_DB).filter(f => f.userId === userId && f.parentId === req.params.id);

    res.json({ files, folders });
});

app.post("/folder", (req, res) => {
    const userId = req.headers["x-user-id"];

    let folders = readJSON(FOLDER_DB);

    const newFolder = {
        id: genId(),
        userId,
        name: req.body.name,
        parentId: req.body.parentId
    };

    folders.push(newFolder);
    writeJSON(FOLDER_DB, folders);

    res.json(newFolder);
});

// ================= START =================
app.listen(PORT, () => {
    console.log("🔥 Server running on port", PORT);
});