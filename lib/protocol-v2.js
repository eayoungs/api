module.exports = (function() {
  var version = "2"

  protocol = {}
  function build_client(socket) {
    return {socket: socket, flags: {}, following: []}
  }

  function client_write(client, msg) {
    if(client.socket) {
      if (typeof msg !== "string") {
        msg = JSON.stringify(msg)
      }
      client.socket.write(msg+"\n")
    }
  }

  protocol.respond = function(client, msg) {
    client_write(client, msg)
  }

  protocol.connection = function(socket, dispatch, close){
    var me = build_client(socket)
    var hello = {type: "hello", version: version}
    client_write(me, hello)

    socket.on('data', function(data) {
      var msgs = multilineParse(data)
      msgs.forEach(function(msg){
        dispatch(me, msg)
      })
    })

    socket.on('close', function() {
      me.socket = null
      close(me)
    })
    return me
  }

  function multilineParse(data) {
    var lines = data.toString('utf8').split('\n')
    lines = lines.map(function(line) {
      if(line.length>0) {
        try {
          var msg = JSON.parse(line)
          return msg
        } catch (err) {
          console.log(err)
        }
      }
    })
    lines = lines.filter(function(msg){return msg})
    return lines
  }


  return protocol
})()