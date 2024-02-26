const mongoose = require('mongoose');
const Conversation = require('./conversation');

const messageSchema = mongoose.Schema({
    conversationId:{
        type: String,
        
    },
    senderId:{
        type: String,
    },
    message:{
        type: String,
    },
    receiverId:{
        type: String,
    },
    file:{
        type: String,
    }
})
const Messages = mongoose.model('Messages',messageSchema );
module.exports = Messages;