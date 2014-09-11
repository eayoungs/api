var major_version = 2
var settings = require('./lib/settings')(major_version),
    net = require('net'),
    http = require('http'),
    sockjs = require('sockjs')
    echo = sockjs.createServer();

var server = http.createServer();
echo.installHandlers(server, {prefix:'/sockjs'});
server.listen(settings.socket_io.listen_port, '0.0.0.0');

console.log("socket.io listening on "+settings.socket_io.listen_port)

echo.on('connection', function(client) {
  console.log(client.id+" connecting to API")
  var apiSocket = net.connect(settings.api.listen_port, "localhost")
  var apiBuffer = "";

  apiSocket.on('data', function(data) {
    var dstr = data.toString('utf8')
    dstr.split('\n').forEach(function(ds, idx) {
      if (idx == 0) { ds = apiBuffer + ds }
      if (idx == ds.length-1) {
        apiBuffer = ds
      } else {
         if (ds.length > 0) {
           var msg = JSON.parse(ds)
           console.log("-> "+ds)
           client.emit('dispatch',msg)
         }
      }
    })
  })

  apiSocket.on('error', function(err) {
    console.log("apiSocket err: "+err)
  })

  client.on('data', function (str) {
    console.log("<-s "+str)
    apiSocket.write(str+"\n")
  });

  client.on('clone', function(client) {
    apiSocket.end()
    console.log('disconnnect!')
  })
});

