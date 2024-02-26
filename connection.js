const mongoose = require('mongoose')

const url = process.env.MONGODB_URL;

mongoose.connect(url, {
    useNewUrlParser : true,
    useUnifiedTopology : true
})
.then(()=>console.log('Connected to database'))
.catch((err)=>console.log('Failed to connect to database',err))
