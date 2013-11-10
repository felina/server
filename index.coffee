express    = require 'express'
passport   = require 'passport'
{Strategy} = require 'passport-local'

app = express()
app.use(express.logger())

stuffDict = {}

passport.use(new Strategy((username, password, done) ->
        console.log username, password, done
    )
)

app.get('/', (request, response) -> response.send('Hello World!\n'))

app.get('/:key/:value', (request, response) -> 
	stuffDict[request.params.key] = request.params.value
	response.send((k + " -> " + v + "\n" for k, v of stuffDict).join(""))
)

app.post('/login', passport.authenticate('local'))

app.post('/', (request, response) -> 
	console.log request
)

port = process.env.PORT or 5000
app.listen(port, -> console.log("Listening on #{port}"))