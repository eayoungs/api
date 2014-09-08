"use strict"

// nodejs
var timers = require('timers')
var crypto = require('crypto')

// npm
var moment = require('moment')
var emailer = require('nodemailer')
var rethink = require('rethinkdb')

// local
var major_version = 2
var settings = require('./lib/settings')(major_version)
var protocol = require('./lib/protocol-v'+major_version)(settings.api)
var server = require('./lib/server').factory()
var db = require('./lib/dblib').factory(rethink)

console.log("v:"+settings.api.version+" host:"+settings.api.hostname)

db.setup(function(){
  server.listen(settings.api.listen_port)
  db.changes().then(function(cursor){
    cursor.on("data", activity_added)
  })
})

server.on('listening', function() {
  console.log("api listening on *:"+settings.api.listen_port)
  timers.setInterval(function() {
      progress_report();
      server.timer.reset();
    }, settings.api.progress_report_timer)
})

server.on('connection', handleConnection)

server.on('close', function() {console.log('closed')})

function handleConnection(socket) {
  var client = server.build_client(socket)
  protocol.connection(client, client_dispatch, end_of_connection)
  server.clients.add(client)
  clog(client, 'connected. '+server.clients.list.length+' clients.');
  progress_report()
}

function end_of_connection(client) {
  server.clients.remove(client)
  progress_report()
}

function client_dispatch(me, msg) {
  switch(msg.method) {
    case 'auth.email': process_auth_email(me, msg); break;
    case 'auth.session': process_auth_session(me, msg); break;
    case 'user.detail': process_user_detail(me, msg); break;
    case 'user.update': process_user_update(me, msg); break;
    case 'activity.add': process_activity_add(me, msg); break;
    case 'stream.follow': process_stream_follow(me, msg); break;
    case 'stream.unfollow': process_stream_unfollow(me, msg); break;
    case 'status': me.flags.stats = true; break;
  }
}

function activity_added(activity_chg){
  if(activity_chg.new_val.type == "gps_point") {
    pump_location(activity_chg.new_val)
  }
}

function pump_location(location) {
  server.clients.list.forEach(function(client) {
    if(client.following.indexOf(location.user_id) >= 0) {
      protocol.api(client, location.type, location)
    }
  })
}

function pump_last_location(client, user_id, count) {
  var now = (new Date()).toISOString()
  db.find_locations_for(user_id, count).then(function(locations){
    console.log('locations '+locatons.count+' returned')
    console.dir(locations)
  })

}

function progress_report() {
  var now = new Date();
  var period = (now - server.timer.mark) / 1000
  var rate = server.timer.hits / period
  var stats = {       type: "status_report",
                    server: settings.api.hostname,
                   version: settings.api.version,
                      date: now.toISOString(),
                  msg_rate: rate,
              client_count: server.clients.list.length}
  db.activity_add(stats)
  console.log('status report - '+rate+' hits/sec. '+server.clients.list.length+' clients.')
}

function clog(client, msg) {
  var parts = []
  parts.push(moment().format())
  if(client.socket) {
    parts.push(client.socket.remoteAddress+':'+client.socket.remotePort);
  }
  if (typeof msg !== "string") {
    parts.push(JSON.stringify(msg))
  } else {
    parts.push(msg)
  }
  console.log(parts.join(' '))
}

function pump_status(status) {
  server.clients.list.forEach(function(client) {
    if(client.flags.stats == true) {
      var stats_str = JSON.stringify(status)
      clog(client, stats_str)
      client_write(client, stats_str+"\n")
    }
  })
}

/* API calls */

function process_activity_add(client, msg) {
  if(client.flags.authenticated){
    msg.params.user_id = client.flags.authenticated.user_id
    msg.params.device_id = client.flags.authenticated.device_id
    db.activity_add(msg.params).then(function(){
      protocol.respond_success(client, msg.id, {message: "saved", id: msg.params.id})
    })
  } else {
    var fail = {message: 'not authorized'};
    protocol.respond_fail(client, msg.id, fail)
  }
}

function process_stream_follow(client, msg) {
  db.find_user_by({username: msg.params.username}).then(function(user){
    client.following.push(user.id)
    protocol.respond_success(client, msg.id, {following:{id:user.username}})
    pump_last_location(client, user.id, 2)
  }, function() {
      protocol.respond_fail(client, msg.id, {code: "UNF",
                                             message: "username "+msg.params.username+" not found"})
  })
}

function gravatar_url(email) {
  var md5sum = crypto.createHash('md5')
  md5sum.update(email)
  var url = "http://www.gravatar.com/avatar/"+md5sum.digest('hex')+"?s=20"
  return url
}

function process_unfollow(me, msg) {
  var follow_idx = me.following.indexOf(msg.username)
  if(follow_idx >= 0) {
    delete me.following[follow_idx]
    var msg = {type: "unfollow",
               username: msg.username,
               status: "OK",
               message: "stopped following"}
    clog(me,"-> "+JSON.stringify(msg))
    client_write(me, msg)
  } else {
    var msg = {type: "unfollow",
               username: msg.username,
               status: "ERR",
               message: "not following"}
    clog(me,"-> "+JSON.stringify(msg))
    client_write(me, msg)
  }
}

function process_auth_email(client, msg) {
  var params = msg.params
  console.log('auth_email '+JSON.stringify(msg))
  server.create_token_temp(params)
    .then(function(token){
      var email_opts = build_token_email(params.email, params.device_id, token)
      send_email(email_opts)
      protocol.respond_success(client, msg.id, {status: "OK"})
    })
}

function process_auth_session(client, msg) {
  server.find_session(msg.params.device_key).then(function(session){
    if(session) {
      console.log("session loaded: "+JSON.stringify(session))
      if(session.email) {
        client_auth_check(client, msg, session)
      } else {
        client_auth_trusted(client, session)
        protocol.respond_success(client, msg.id, {user:{id:session.user_id}})
      }
    } else {
      // device_key not found
      protocol.respond_fail(client, msg.id, {code: "BK1", message: "bad device_key"})
    }
  }).catch(function(err){console.log('Err! '+err)})
}

function client_auth_check(client, msg, session) {
  db.find_user_by(rethink.row('email').eq(session.email)).then(function(user){
    clog(client, 'authenticating session for '+session.email)
    if(user.devices.indexOf(session.device_id) > -1) {
      clog(client, '* existing device '+session.device_id);
      return user
    } else {
      clog(client, '* adding device '+session.device_id);
      return db.user_add_device(user.id, session.device_id).then(function(){return user})
    }
  }, function(){
    console.log('user not found by '+session.email)
    var new_user = user_new(session.email, session.device_id)
    return db.ensure_user(new_user)
  }).then(function(user){
    clog(client, 'token validate '+JSON.stringify(user))
    server.token_validate(msg.params.device_key, user.id, session.device_id).then(function(session){
      clog(client, "post token validate w/ "+JSON.stringify(session))
      client_auth_trusted(client, session)
      protocol.respond_success(client, msg.id, {user:{id:user.id}})
    })
  })
}

function client_auth_trusted(client, session) {
  client.flags.authenticated = session
  clog(client, "client flag set to trusted user "+session.user_id)
}

function user_new(email, device_id){
  var user = {email:email, devices: [device_id]}
  return user
}

function process_user_detail(client, msg) {
  if(client.flags.authenticated){
    // default value is the authenticated user
    db.find_user_by(rethink.row('id').eq(client.flags.authenticated.user_id)).then(function(user){
      protocol.respond_success(client, msg.id, user)
    })
  } else {
    protocol.respond_fail(client, msg.id, {message:"Not authenticated"})
  }
}

function process_user_update(client, msg) {
  if(client.flags.authenticated){
    // default value is the authenticated user
    db.update_user_by(client.flags.authenticated.user_id, msg.params).then(function(result){
      clog(client, "user updated")
      console.dir(result)
      protocol.respond_success(client, msg.id, result)
    })
  } else {
    protocol.respond_fail(client, msg.id, {message:"Not authenticated"})
  }
}

function build_token_email(email, device_id, token) {
  var auth_url = "icecondor://android/v2/auth?access_token="+token
  var link = "https://icecondor.com/oauth2/authorize?client_id=icecondor-nest"+
             "&response_type=token&redirect_uri="+encodeURIComponent(auth_url)
  var emailOpt = {
    from: 'IceCondor <system@icecondor.com>',
    to: email,
    subject: 'Login Link',
    text: 'IceCondor Login link for Android\n\n'+link+'\n',
    //html: '<b>Hello world </b>'
    }
  return emailOpt
}

function send_email(params) {
  var transporter = emailer.createTransport()
  transporter.sendMail(params, function(error, info){
    if(error){
        console.log("email error: "+error);
    } else {
        console.log('Message sent to '+ params.to);
    }
  });
}