const express = require("express");
const app = express();
const path = require("path");
const http = require("http");
const socketio = require("socket.io");
const server = http.createServer(app);
const io = socketio(server);

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

let activeUsers = 0;

// Store connected users
let users = {};
io.on("connection", function(socket) {
    activeUsers++;
    io.emit("active-users-count", activeUsers); // Broadcast the updated active users count

    // Send the list of current users to the newly connected user (including avatars)
    socket.emit("existing-users", users);

    socket.on("send-location", function(data) {
        users[socket.id] = { ...data };
        io.emit("recieve-location", { id: socket.id, ...data });
    });

    socket.on("update-avatar", function(data) {
        if (users[socket.id]) {
            users[socket.id].selectedAvatar = data.selectedAvatar;
        }
        io.emit("update-avatar", { id: socket.id, ...data });
    });

    socket.on("send-message", function(data) {
        const { to, message } = data;
        io.to(to).emit("receive-message", { from: socket.id, message });
    });

    socket.on("update-name", function(data) {
        if (users[socket.id]) {
            users[socket.id].userName = data.userName;
        }
        io.emit("update-name", { id: socket.id, userName: data.userName });
    });

    socket.on("disconnect", function() {
        activeUsers--;
        io.emit("active-users-count", activeUsers); // Broadcast the updated active users count
        delete users[socket.id];
        io.emit("user-disconnected", socket.id);
    });
});


app.get("/", function(req, res) {
    res.render("index");
});

server.listen(3000, () => {
    console.log("Server running on port 3000");
});
