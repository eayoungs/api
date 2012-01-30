var settings = require('./settings'),
    net = require('net');

console.log("socket.io listening on "+settings.socket_io.listen_port)

var express = require('express')
  , app = express.createServer()
  , io = require('socket.io').listen(app)

app.use(express.static(__dirname + '/html'));
app.listen(settings.socket_io.listen_port);

// serve an html page for testing
app.get('/', function (req, res) {
  res.sendfile(__dirname + '/html/index.html');
});

// socket.io
io.sockets.on('connection', function (client) {
  console.log(client.id+" connecting to API")
  var apiSocket = net.connect(settings.api.listen_port, "localhost")

  apiSocket.on('data', function(data) {
    var msg = JSON.parse(data.toString('utf8'))
    console.log("-> "+msg)
    client.emit('dispatch',msg)
  })

  apiSocket.on('error', function(err) {
    console.log("apiSocket err: "+err)
  })

  client.on('api', function (str) {
    /* which is it? */
    if(typeof str == 'string') {
      /* string */ 
      var msgs = JSON.parse(str)
      msgs.forEach(function(msg){
        var data = JSON.stringify(msg)
        console.log("<-s "+data)
        apiSocket.write(data+"\n")
      }) 
    } else {
      /* message object */
      var ostr = JSON.stringify(str);
      console.log("<-o "+ostr);
      apiSocket.write(ostr+"\n")
    }
  });

  client.on('disconnect', function(client) {
    apiSocket.end()
    console.log('disconnnect!')
  })
});

