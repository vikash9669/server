require('dotenv').config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const multer = require("multer");
const ASSET_URL = "192.168.1.151:8000";
const path = require("path");
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});
const port = process.env.PORT || 8000;

// multer connection for diskstorage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + file.originalname);
  },
});
const upload = multer({ storage: storage });

// connect to db
require("./connection");


//import all models schema files
const Users = require("./models/users");
const Conversations = require("./models/conversation");
const Messages = require("./models/messages");
// app use

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());
app.use("/uploads", express.static(__dirname + "/uploads"));

// socket.io
let users = [];
io.on("connection", (socket) => {
  console.log("runninn on port 8080 ");
  socket.on("addUser", (userId) => {
    const isUserExist = users.find((user) => user.userId === userId);
    console.log(isUserExist, "isUserExist");
    if (!isUserExist) {
      const user = { userId: userId, socketId: socket.id };
      users.push(user);
      io.emit("getUsers", users);
      console.log(users, "allconnectedusers Array");
    }
  });

  socket.on(
    "sendMessage",
    async ({ message, conversationId, senderId, receiverId }) => {
      const receiver = users.find((user) => user.userId === receiverId);
      const sender = users.find((user) => user.userId === senderId);
      console.log(receiverId, receiver, sender, "receiver and sender");
      if (receiver) {
        await io.to(receiver.socketId).to(sender.socketId).emit("getMessage", {
          message,
          conversationId,
          senderId,
          receiverId,
        });
      }
    }
  );

  socket.on("disconnect", () => {
    users = users.filter((user) => user.socketId !== socket.id);
    io.emit("getUsers", users);
  });
});

//routes
app.get("/", (req, res) => {
  res.send("welcome back");
  // res.sendFile(path.join(__dirname, "dist", "index.html"));
});

//multer apis
app.post("/api/upload-files", upload.single("file"), async (req, res) => {
  console.log(req.body);
  return res.status(200).send("uploaded");
});

//register user api
app.post("/api/register", async (req, res, next) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      res.status(400).send("please fill all fields");
    } else {
      const isAlreadyRegistered = await Users.findOne({ email });
      if (isAlreadyRegistered) {
        res.status(400).send("Email already registered");
      } else {
        const newUser = new Users({ email, fullName });
        bcryptjs.hash(password, 10, (err, hashedPassword) => {
          newUser.set("password", hashedPassword);
          newUser.save();
          next();
        });
        return res.status(200).send("user has been registered successfully");
      }
    }
  } catch (err) {
    console.log(err, "err");
  }
});

// login user api
app.post("/api/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).send("Invalid email or password");
    } else {
      const user = await Users.findOne({ email });
      if (!user) {
        res.status(400).send("Invalid email or password");
      } else {
        const validateUser = await bcryptjs.compare(password, user.password);
        if (!validateUser) {
          res.send("Invalid email or password");
        } else {
          const payload = {
            userId: user._id,
            email: user.email,
          };
          const JWT_SECRET_KEY =
            process.env.JWT_SECRET_KEY || "THIS_IS_A_JWT_SECRET_KEY";

          jwt.sign(
            payload,
            JWT_SECRET_KEY,
            { expiresIn: 84600 },
            async (err, token) => {
              await Users.updateOne(
                { _id: user._id },
                {
                  $set: { token },
                }
              );
              user.save();
              next();
            }
          );
          // console.log(user.token)
          res.status(200).json({
            user: {
              id: user._id,
              email: user.email,
              fullName: user.fullName,
            },
            token: user.token,
          });
        }
      }
    }
  } catch (err) {
    console.log(err, "err");
  }
});

//conversations api
app.post("/api/conversation", async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;

    const newConversation = new Conversations({
      members: [senderId, receiverId],
    });
    await newConversation.save();
    res.status(200).send("Conversation saved successfully");
  } catch (error) {
    console.log(error, "Error");
  }
});

// members api
app.get("/api/conversations/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const conversations = await Conversations.find({
      members: { $in: [userId] },
    });

    const conversationUserData = Promise.all(
      conversations.map(async (conversation) => {
        const receiverId = conversation.members.find(
          (member) => member !== userId
        );
        const user = await Users.findById(receiverId);
     return {
          user: { email: user.email, fullName: user.fullName, id: user._id },
          conversationId: conversation._id,
        };
      })
    );
    res.status(200).json(await conversationUserData);
  } catch (error) {
    console.log(error, "Error");
  }
});

//messages api
app.post("/api/message", upload.single("file"), async (req, res) => {
  try {
    const { conversationId, senderId, message, receiverId = "" } = req.body;
    let file = "";
    if (req.file) {
      file = `${ASSET_URL}/uploads/${req.file.filename}`;
    }
 
    console.log(message, "message");
    if (!senderId || (!message && !file))
      return res.status(400).send("please fill all a the fields");
    if (conversationId === "new" && receiverId) {
      const newConversation = new Conversations({
        members: [senderId, receiverId],
      });

      await newConversation.save();
      const newMessage = new Messages({
        file: file,
        conversationId: newConversation._id,
        senderId,
        message,
        receiverId,
      });
      console.log(newMessage, "newMessage");
      await newMessage.save();
      return res.status(200).send("message sent successfully");
    } else if (!conversationId && !receiverId) {
      res.status(400).send("please fill all fields");
    }

    const newMessage = new Messages({
      file,
      conversationId,
      senderId,
      message,
    });
    await newMessage.save();
    res.status(200).send("message sent successfully");
  } catch (error) {
    console.log(error, "Error");
  }
});
// all user messages api
app.get("/api/messages/:conversationId", async (req, res) => {
  try {
    const conversationId = req.params.conversationId;
    const checkMessages = async (conversationId) => {
      console.log(conversationId, "conversationId");
      const messages = await Messages.find({ conversationId });
      const messageUserData = Promise.all(
        messages.map(async (message) => {
          const user = await Users.findById(message.senderId);
          return {
            user: { email: user.email, fullName: user.fullName },
            fullName: user.fullName,
            id: user._id,
            message: message.message,
            file: message.file,
          };
        })
      );

      res.status(200).json(await messageUserData);
    };
    if (conversationId === "new") {
      const checkConversation = await Conversations.find({
        members: { $all: [req.query.senderId, req.query.receiverId] },
      });

      if (checkConversation.length > 0) {
        checkMessages(checkConversation[0]._id);
      } else {
        return res.status(200).json([]);
      }
    } else {
      checkMessages(conversationId);
    }
  } catch (error) {
    console.log(error, "Error");
  }
});

// all connected users
app.get("/api/users/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const conversations = await Conversations.find({
      members: { $in: [userId] },
    });
    // Extract user IDs from conversations
    const conversationUserIds = conversations
      .map((conversation) => conversation.members)
      .flat();
    const uniqueConversationUserIds = [...new Set(conversationUserIds)];

    const users = await Users.find({
      _id: { $ne: userId, $nin: uniqueConversationUserIds },
    });
    const userData = Promise.all(
      users.map(async (user) => {
        return {
          user: {
            email: user.email,
            fullName: user.fullName,
            id: user._id,
          },
          id: user._id,
        };
      })
    );
    res.status(200).json(await userData);
  } catch (error) {
    console.log(error, "Error");
  }
});

// app port details
server.listen(port, () => {
  console.log("listening on port" + port);
});
