// controllers/imageController.js
const Image = require("../models/Image");
const fs = require("fs");
const axios = require("axios");
const path = require("path");
const { generateHash } = require("../utils/fileHelper");

exports.dashboard = async (req,res)=>{
  const total = await Image.countDocuments({ user: req.user.id });
  res.render("dashboard", { total });
};

exports.uploadPage = (req,res)=> res.render("upload");

exports.uploadImage = async (req,res)=>{
  const buffer = fs.readFileSync(req.file.path);
  const hash = generateHash(buffer);

  const exists = await Image.findOne({ hash });
  if (exists) {
    fs.unlinkSync(req.file.path);
    return res.send("Duplicate image!");
  }

  const url = process.env.BASE_URL + "/uploads/" + req.file.filename;

  await Image.create({
    user: req.user.id,
    filename: req.file.filename,
    url,
    hash
  });

  res.send(url);
};

exports.uploadFromUrl = async (req,res)=>{
  const response = await axios({
    url: req.body.imageUrl,
    responseType: "arraybuffer"
  });

  const buffer = Buffer.from(response.data);
  const hash = generateHash(buffer);

  const exists = await Image.findOne({ hash });
  if (exists) return res.send("Duplicate!");

  const filename = Date.now() + ".jpg";
  const filepath = "public/uploads/" + filename;

  fs.writeFileSync(filepath, buffer);

  const url = process.env.BASE_URL + "/uploads/" + filename;

  await Image.create({
    user: req.user.id,
    filename,
    url,
    hash
  });

  res.send(url);
};

exports.listImages = async (req, res) => {
  const images = await Image.find({ user: req.user.id });
  res.render("list", { images });
};

exports.apiUpload = async (req, res) => {
  try {

    if (req.body.image) {
      const { image, imageName } = req.body;

      if (!imageName) {
        return res.status(400).json({
          success: false,
          message: "imageName required"
        });
      }

      const response = await axios({
        url: image,
        responseType: "arraybuffer"
      });

      const buffer = Buffer.from(response.data);
      const hash = generateHash(buffer);

      // 🔁 duplicate check
      const exists = await Image.findOne({ hash });

      if (exists) {
        return res.json({
          success: true,
          duplicate: true,
          message: "Image already exists",
          data: {
            filename: exists.filename,
            url: exists.url
          }
        });
      }

      const ext = image.split(".").pop().split("?")[0] || "jpg";
      let filename = imageName + "." + ext;

      const filePath = path.join(__dirname, "../public/uploads/", filename);

      // 🔒 filename conflict handle
      if (fs.existsSync(filePath)) {
        filename = imageName + "-" + Date.now() + "." + ext;
      }

      const finalPath = path.join(__dirname, "../public/uploads/", filename);
      fs.writeFileSync(finalPath, buffer);

      const url = process.env.BASE_URL + "/uploads/" + filename;

      // 🔥 SAVE (no user)
      await Image.create({
        filename,
        url,
        hash
      });

      return res.json({
        success: true,
        duplicate: false,
        data: {
          filename,
          url
        }
      });
    }

    return res.status(400).json({
      success: false,
      message: "No image URL provided"
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};
// DELETE IMAGE
exports.deleteImage = async (req, res) => {
  
  try {
    const image = await Image.findById(req.params.id);

    if (!image) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    // 🔐 ownership check (VERY IMPORTANT)
    if (image.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }

    const filePath = path.join(__dirname, "../public/uploads/", image.filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await Image.deleteOne({ _id: req.params.id });

    res.json({ success: true, message: "Deleted" });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};