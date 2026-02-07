const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const cors = require("cors");
const Tesseract = require("tesseract.js");

const app = express();
app.use(express.json());
app.use(cors());

const SECRET = "GYNEX_SECRET_KEY";

/* ---------- DATABASE ---------- */
const db = new sqlite3.Database("database.db");

db.run(`
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT,
 email TEXT UNIQUE,
 password TEXT,
 otp TEXT
)
`);

/* ---------- FILE UPLOAD ---------- */
const upload = multer({ dest: "uploads/" });

/* ---------- SIGNUP ---------- */
app.post("/signup", async (req,res)=>{
  const {name,email,password} = req.body;
  const hashed = await bcrypt.hash(password,10);
  const otp = Math.floor(100000+Math.random()*900000).toString();

  db.run(
    "INSERT INTO users(name,email,password,otp) VALUES(?,?,?,?)",
    [name,email,hashed,otp],
    err=>{
      if(err) return res.status(400).json({msg:"User exists"});
      console.log("OTP:",otp);
      res.json({msg:"OTP sent"});
    }
  );
});

/* ---------- VERIFY OTP ---------- */
app.post("/verify",(req,res)=>{
  const {email,otp} = req.body;

  db.get(
    "SELECT otp FROM users WHERE email=?",
    [email],
    (err,row)=>{
      if(row && row.otp===otp)
        res.json({msg:"Verified"});
      else
        res.status(400).json({msg:"Wrong OTP"});
    }
  );
});

/* ---------- LOGIN ---------- */
app.post("/login",(req,res)=>{
  const {email,password}=req.body;

  db.get(
    "SELECT * FROM users WHERE email=?",
    [email],
    async (err,user)=>{
      if(!user) return res.status(401).json({msg:"Invalid"});

      const match = await bcrypt.compare(password,user.password);
      if(!match) return res.status(401).json({msg:"Invalid"});

      const token = jwt.sign({email},SECRET);
      res.json({token});
    }
  );
});

/* ---------- PROFILE ---------- */
app.get("/profile/:email",(req,res)=>{
  db.get(
    "SELECT name,email FROM users WHERE email=?",
    [req.params.email],
    (err,row)=>res.json(row)
  );
});

/* ---------- OCR ---------- */
app.post("/ocr", upload.single("file"), async (req,res)=>{
  try{
    const result = await Tesseract.recognize(req.file.path,"eng");
    res.json({text:result.data.text});
  }catch(err){
    res.status(500).json({error:err.message});
  }
});

/* ---------- SERVER ---------- */
const PORT = process.env.PORT || 5000;

app.listen(PORT, ()=>{
  console.log("Server running on port", PORT);
});
