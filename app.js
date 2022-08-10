const express = require('express');

const app = express()
const port = 3000
const s = app.listen(port)
const sanitizeHTML = require('sanitize-html');
const ws = require('ws').Server;
const wss = new ws({ server: s })
let joi = require('joi')
const session = require('express-session')
const admin = require('firebase-admin');

admin.initializeApp({
    credential: admin.credential.cert(require('./key/admin.json'))
})

const db = admin.firestore();







let usersName = []
app.use(session({
    secret: 'our name',
    resave: false, saveUninitialized: true,
    maxAge: new Date(Date.now() + 3600000)
}))
let flash = require('req-flash');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const myPlaintextPassword = 'our name';
app.use(flash())
app.use((req, res, next) => {
    res.locals.error = req.flash('error')
    next()
})
const extension = (joi) => ({
    type: 'string',
    base: joi.string(),
    messages: {
        'string.escapeHTML': '{{#label}} must not include HTML!'
    }, rules: {
        escapeHTML: {
            validate(value, helpers) {

                const clean = sanitizeHTML(value, {
                    allowedTags: [], allowedAttributes: {}
                })
                if (clean !== value) return helpers.error('string.escapeHTML', { value })
                return clean
            }
        }
    }
})
const uniqueUser = (joi) => ({
    type: 'string',
    base: joi.string(),
    messages: {
        'username.taken': ' username already taken'
    }, rules: {
        taken: {
            validate(value, helpers) {
                if (usersName.includes(value.toLowerCase())) {
                    return helpers.error('username.taken')
                }

                return value
            }
        }
    }
})
joi = joi.extend(extension)
joi = joi.extend(uniqueUser)
const usernameValdiation = (req, res, next) => {

    const { error } = joi.object({
        username: joi.string().required().trim().min(3).escapeHTML().pattern(/^[a-z,A-z]+([1-9]|-|_|[a-z,A-Z])*$/).taken()
    }).validate(req.body)
    if (error) {
        next(error)
    }
    else {
        next()
    }
}
let userAuth = []
app.set('view engine', 'ejs')
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(express.static('public'))


let users = []
wss.on("connection", async (w, req) => {
    const check = [req.url.split('/').slice(1).join('/').split('/')[0], req.url.split('/').slice(1).join('/').split('/').slice(1).join('/')]
    let found = false;

    let thisUser
    for (let i = 0; i < userAuth.length; i++) {
        if (userAuth[i].username == check[0] && userAuth[i].token == check[1]) {
            found = true
            thisUser = userAuth[i]
        }

    }
    if (found) {

        let msg = []

        db.collection('chat').orderBy('date').onSnapshot(value => {

            value.docChanges().forEach(element => {
                if (element.type == "added") {
                    if (!msg.includes(element)) {
                        w.send(JSON.stringify({
                            type: 'server',
                            method: req.method,
                            headers: req.headers,
                            body: element.doc.data().message,
                            id: thisUser.username,
                            sender: element.doc.data().sender,
                            docId: element.doc.id,
                            operation: element.type

                        }))
                        msg.push(element)
                    }
                }
                else if (element.type == "removed") {
                    w.send(JSON.stringify({
                        type: 'server',
                        method: req.method,
                        headers: req.headers,
                        body: element.doc.data().message,
                        id: thisUser.username,
                        sender: element.doc.data().sender,
                        docId: element.doc.id,
                        operation: element.type

                    }))
                    msg.map(value => value.doc.id != element.doc.id)
                }
                else {
                    w.send(JSON.stringify({
                        type: 'server',
                        method: req.method,
                        headers: req.headers,
                        body: element.doc.data().message,
                        id: thisUser.username,
                        sender: element.doc.data().sender,
                        docId: element.doc.id,
                        operation: element.type

                    }))
                    msg.find(value => {
                        if (value.doc.id == element.doc.id) {
                            value = element
                        }
                    })
                }



            })

        }, error => {
            console.log("error!!")
            w.send({ status: 403, body: error })
            w.close()
        })


        users.push({ client: w, u: thisUser, msg: msg });

        w.on("message", async (msg) => {

            for (let i = 0; i < users.length; i++) {
                if (w == users[i].client) {
                    sender = users[i].u.username
                    const docRef = db.collection('chat').doc();

                    await docRef.set({
                        sender: users[i].u.username, message: msg.toString(), date: Date.now()
                    })

                }

            }


        })
    }
    else {
        w.close()
    }


})
const axios = require('axios')
app.get('/', async (req, res, next) => {
    try {
        // await axios.get("http://firebase.com")




        if (req.session.user) {

            res.redirect('/home')
        }
        else {

            res.render('login')
        }

    } catch (value) {
        next({ value })
    }

}
)
app.post('/', usernameValdiation, async (req, res, next) => {
    try {
        await axios.get("http://firebase.com")
        if (!req.session.user) {
            req.session.user = req.body.username
            usersName.push(req.body.username.toLowerCase())
            let token = await bcrypt.hash(myPlaintextPassword, saltRounds)

            userAuth.push({ token: token, username: req.session.user })
            const docRef = db.collection('users').doc(req.session.user);
            await docRef.set({
                token: token
            }).then((v) => {
                console.log(v);
                return v;
            }).catch((value) => {
                console.log(value);
                next(value)
                return value;
            })

            res.send({ token: token, username: req.session.user });
        }
        else {
            res.send({ msg: "already logged in" });
        }


    } catch (value) {
        next({ value })
    }
}
)
app.get('/home', async (req, res, next) => {
    try {
        await axios.get("http://firebase.com")
        if (req.session.user) {
            let found = false
            let theAuth = null
            for (let i = 0; i < userAuth.length; i++) {
                if (userAuth[i].username == req.session.user) {
                    theAuth = userAuth[i]
                    found = true
                }
            }


            res.render('home', { current: theAuth.username, token: theAuth.token })

        }
        else {

            res.redirect('/')
        }
    } catch (value) {
        next({ value })
    }
}

)

app.use((err, req, res, next) => {
    console.log(err);
    res.send({ error: err })
})