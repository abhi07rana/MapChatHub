const socket = io();

// Ask the user for their name
let userName = prompt("What is your name?");
const avatarSelect = document.getElementById('avatarSelect');
let selectedAvatar = avatarSelect.value;

// Object to store chat history for each user
const chatHistories = {};

// Function to update the avatar in real-time
function updateAvatar() {
    selectedAvatar = avatarSelect.value;
    socket.emit('update-avatar', { selectedAvatar, userName });
}

// Update selectedAvatar when user changes selection and emit the event
avatarSelect.addEventListener('change', updateAvatar);

if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            socket.emit("send-location", { latitude, longitude, userName, selectedAvatar });
        },
        (error) => {
            console.error(error);
        },
        {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0,
        }
    );
}

const map = L.map("map").setView([0, 0], 16);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

const markers = {};

// Load notification sound
const notificationSound = new Audio('/sounds/notification.mp3');

// Function to show a notification
function showNotification(message) {
    const notification = document.getElementById('notification');
    notification.innerText = message;
    notification.style.display = 'block';
    notificationSound.play();

    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000); // Hide after 3 seconds
}

// Create chat box HTML
function createChatBox(userName) {
    return `
        <div class="chat-box">
            <h3>Chat with ${userName}</h3>
            <div class="chat-messages" id="chat-messages"></div>
            <input type="text" id="chat-input" placeholder="Type a message" />
            <button id="chat-send">Send</button>
        </div>
    `;
}

// Create edit popup for user details
function createEditPopup(userName) {
    return `
        <div class="edit-popup">
            <h3>Your Details</h3>
            <p>Name: <span id="display-name">${userName}</span></p>
            <input type="text" id="edit-name-input" placeholder="Edit your name" />
            <button id="save-name-button">Save Name</button>
        </div>
    `;
}

// Function to attach event listeners for editing the name
function attachEditListeners(marker) {
    const saveNameButton = document.getElementById('save-name-button');
    const editNameInput = document.getElementById('edit-name-input');
    const displayName = document.getElementById('display-name');

    saveNameButton.addEventListener('click', () => {
        const newName = editNameInput.value.trim();
        if (newName) {
            userName = newName;
            displayName.innerText = userName;
            marker.bindPopup(createEditPopup(userName)).openPopup();
            socket.emit('update-name', { id: socket.id, userName });
        }
    });
}

// Function to load chat history into the chat box
function loadChatHistory(userId, chatMessages) {
    if (chatHistories[userId]) {
        chatHistories[userId].forEach((message) => {
            chatMessages.innerHTML += `<div class="message ${message.type}"><strong>${message.sender}:</strong> ${message.text}</div>`;
        });
    }
}

// Function to update the active users count
function updateActiveUsersCount(count) {
    const activeUsersElement = document.getElementById('active-users');
    activeUsersElement.innerText = `Active Users: ${count}`;
}

// Handle receiving location and marker creation
socket.on("recieve-location", (data) => {
    const { id, latitude, longitude, userName, selectedAvatar } = data;
    map.setView([latitude, longitude]);

    // Define custom icon
    const customIcon = L.icon({
        iconUrl: selectedAvatar,
        iconSize: [100, 100], // Increase size here (width, height)
        iconAnchor: [25, 50], // Anchor point of the icon
        popupAnchor: [0, -50] // Position where the popup should open
    });

    if (markers[id]) {
        markers[id].setLatLng([latitude, longitude]);
        markers[id].setIcon(customIcon); // Update icon if avatar changes
    } else {
        // Create a marker with the custom icon
        markers[id] = L.marker([latitude, longitude], {
            icon: customIcon,
            title: userName // Set the hover text to the user's name
        }).addTo(map);

        // Bind a popup with a chat box or edit popup depending on the user
        if (id === socket.id) {
            markers[id].bindPopup(createEditPopup(userName)).on('popupopen', function() {
                attachEditListeners(markers[id]);
            });
        } else {
            markers[id].bindPopup(createChatBox(userName)).on('popupopen', function() {
                // Attach event listeners to chat elements when popup opens
                const chatInput = document.getElementById('chat-input');
                const chatSend = document.getElementById('chat-send');
                const chatMessages = document.getElementById('chat-messages');

                // Load chat history for this user when the chat box is opened
                loadChatHistory(id, chatMessages);

                // Handle sending a chat message
                chatSend.addEventListener('click', function() {
                    const message = chatInput.value;
                    if (message.trim() !== "") {
                        socket.emit('send-message', { to: id, from: socket.id, message });
                        chatMessages.innerHTML += `<div class="message sent"><strong>You:</strong> ${message}</div>`;
                        chatInput.value = ''; // Clear input after sending

                        // Save message to chat history
                        if (!chatHistories[id]) chatHistories[id] = [];
                        chatHistories[id].push({ sender: 'You', text: message, type: 'sent' });
                    }
                });
            });
        }

        // Show a notification when a user enters
        showNotification(`${userName} has entered the map.`);
    }
});

// Handle receiving chat messages
socket.on("receive-message", (data) => {
    const { from, message } = data;
    const chatMessages = document.getElementById('chat-messages');

    // Save message to chat history
    if (!chatHistories[from]) chatHistories[from] = [];
    chatHistories[from].push({ sender: markers[from].options.title, text: message, type: 'received' });

    if (chatMessages) {
        chatMessages.innerHTML += `<div class="message received"><strong>${markers[from].options.title}:</strong> ${message}</div>`;
    } else {
        // If the chat window is not open, show a notification
        showNotification(`${markers[from].options.title} sent you a message.`);
    }
});

socket.on("user-disconnected", (id) => {
    if (markers[id]) {
        const userName = markers[id].options.title;
        map.removeLayer(markers[id]);
        delete markers[id];

        // Show a notification when a user exits
        showNotification(`${userName} has left the map.`);
    }
});

// Listen for avatar updates
socket.on("update-avatar", (data) => {
    const { id, selectedAvatar } = data;

    if (markers[id]) {
        // Update the marker's icon
        const customIcon = L.icon({
            iconUrl: selectedAvatar,
            iconSize: [150, 150],
            iconAnchor: [25, 50],
            popupAnchor: [0, -50]
        });
        markers[id].setIcon(customIcon);
    }
});

// Listen for name updates
socket.on("update-name", (data) => {
    const { id, userName } = data;
    if (markers[id]) {
        markers[id].options.title = userName;
    }
});

// Listen for active user count updates
socket.on("active-users-count", (count) => {
    updateActiveUsersCount(count);
});
socket.on("existing-users", (users) => {
    Object.keys(users).forEach((id) => {
        const { latitude, longitude, userName, selectedAvatar } = users[id];

        // Define custom icon
        const customIcon = L.icon({
            iconUrl: selectedAvatar,
            iconSize: [100, 100], // Adjust size if necessary
            iconAnchor: [25, 50],
            popupAnchor: [0, -50]
        });

        // Create a marker with the custom icon for existing users
        markers[id] = L.marker([latitude, longitude], {
            icon: customIcon,
            title: userName // Set hover text to the user's name
        }).addTo(map);

        // Bind the appropriate popup based on user
        if (id === socket.id) {
            markers[id].bindPopup(createEditPopup(userName)).on('popupopen', function() {
                attachEditListeners(markers[id]);
            });
        } else {
            markers[id].bindPopup(createChatBox(userName)).on('popupopen', function() {
                const chatInput = document.getElementById('chat-input');
                const chatSend = document.getElementById('chat-send');
                const chatMessages = document.getElementById('chat-messages');

                loadChatHistory(id, chatMessages);

                chatSend.addEventListener('click', function() {
                    const message = chatInput.value;
                    if (message.trim() !== "") {
                        socket.emit('send-message', { to: id, from: socket.id, message });
                        chatMessages.innerHTML += `<div class="message sent"><strong>You:</strong> ${message}</div>`;
                        chatInput.value = ''; // Clear input after sending

                        if (!chatHistories[id]) chatHistories[id] = [];
                        chatHistories[id].push({ sender: 'You', text: message, type: 'sent' });
                    }
                });
            });
        }
    });
});
