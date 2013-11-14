express    = require 'express'
passport   = require 'passport'
{Strategy} = require 'passport-local'
path = require 'path'
fs = require 'fs'


app = express()
app.use(express.logger())#, express.bodyParser({ keepExtensions: true, uploadDir: __dirname + '/app/uploads' }))
app.use(express.bodyParser())

stuffDict = {}

passport.use(new Strategy((username, password, done) ->
        console.log username, password, done
    )
)

app.get('/', (req, res) -> res.send('Hello World!\n'))

app.get('/:key/:value', (req, res) -> 
	stuffDict[req.params.key] = req.params.value
	res.send((k + " -> " + v + "\n" for k, v of stuffDict).join(""))
)

app.post('/login', passport.authenticate('local'))

app.post('/', (req, res) -> 
	console.log req
)

app.post('/file', (req, res) ->
	console.log 'here1'
	# if path.extname(req.files.file.name).toLowerCase() == '.png'
		# console.log 'here'
	if req.files
		console.log 'File exists'
	else
		console.log 'File does not exist'
	# console.log JSON.stringify(req.files)
	# res.send(format('\nuploaded %s (%d Kb) to %s as %s'
 #    , req.files.image.name
 #    , req.files.image.size / 1024 | 0 
 #    , req.files.image.path
 #    , req.body.title));
	res.send("Some image thing recieved\n")
)

port = process.env.PORT or 5000
app.listen(port, -> console.log("Listening on #{port}"))