/* livecalc.js */

var cookie = require('cookie');

var site_user_count = 0;

/* old globals */
var io, sheet_db, chat_db, stats, cache_user_model;

var namespaces = [];

module.exports = {};

module.exports.namespaces = namespaces;

/* Set socket.io et al. */
module.exports.set_globals = function (
    new_io,
    new_sheet_db,
    new_chat_db,
    new_stats,
    new_cache_user_model ){
    
    io = new_io;
    sheet_db = new_sheet_db;
    chat_db = new_chat_db;
    stats = new_stats;
    cache_user_model = new_cache_user_model;
};


/**
   Callback is supposed to render page
 */
module.exports.new_namespace = function(namespace){
    var nsp = io.of("/"+namespace);
    
    livecalc(namespace, nsp);
}

/**
   Sidebar chat 
   
   This is the code that listens to everything related to the chat.
 */
module.exports.livechat = livechat;
function livechat(namespace, nsp, socket, user){
    var user;
    
    var exports = {};

    exports.set_user = function(new_user){
        user = new_user;
    };
    
    socket.on("load more messages",function(last_sent){
        chat_db.get_conv(namespace,function(data){
            socket.emit("past messages", data);
        });
    });
    
    socket.on("new message", function(data){
        if(user == undefined){
            return;
        }

        var data = {
            message: data.message,
            sender: user.get_nickname(),
            public_id: user.get_public_id()
        };
        
        chat_db.add_message(namespace, data);
        
        socket.broadcast.emit("new message", data);
        socket.emit("own message", data);
    });

    return exports;
}

/*
  callback(success)
*/
module.exports.livecalc = livecalc;
function livecalc(namespace, nsp){
    var model = require("./sheet_model").create();
    var sheet_user_count = 0;

    namespaces.push(namespace);

    // Check if sheet exists
    // Then load it and serve normally
    sheet_db.exists(namespace, function(exists){
        if(exists){
            sheet_db.get_sheet(namespace, function(data){
                model.set_sheet(data);
                listen();
            })
        } else {
            console.log("Someone tries to access namespace: "+namespace+
                        " but it does not exist. This should not happen.");
        }
    });
    
    function listen(){
        /*
         Array of users used to create focus index
         
         note: don't rely on a value being in there.
         
         for(i in users) == ok
         users[my_id] == not ok, don't do that!
         (it might not exist)
         
        */
        var users = {};
        
        nsp.on("connection", function(socket){
            var cookie_val = socket.handshake.headers['cookie'];
            var session_id = cookie.parse(cookie_val || '').session_id || "";
            var registered = false;
            var user;
            var public_id;
            
            function temp_user(){
                // Temporary user
                // Will be saved at disconnection
                // To keep nickname and other info
                user = cache_user_model.create();
                public_id = user.get_public_id();

                // Generate a temporary session id
                // (That will not be saved, even to redis
                session_id = user.get_session_id();
                users[session_id] = user;
            }
            
            if(session_id != ""){
                // User says "im logged in"
                // See if the user is actually in redis
                cache_user_model.temp_exists(session_id, function(exists){
                    if(exists){
                        // User actually logged in
                        registered = true;
                        user = cache_user_model.User(session_id);
                        user.fetch(function(){
                            public_id = user.get_public_id();
                            users[session_id] = user.get_public_data();
                            chat.set_user(user);
                            send_user_data();
                        });
                    } else {
                        // User had a session_id, but it
                        // is not in db. (expired/never existed)
                        // TODO: inform user he is not connected.
                        console.log(
                            "Attempt to login with bad cookie token."
                        );
                        
                        temp_user();
                        
                        // Send temp data
                        send_user_data();
                    }
                });
            } else {
                // User is not logged in
                temp_user();
                // Still send temp data
                send_user_data();
            }

            send_focus_index();
            
            // rate limiting
            if(sheet_user_count >= 3){
                socket.emit("too many users");
                return;
            }

            stats.new_sheet_visit(namespace);

            stats.get_sheet_visits(namespace, function(num){
                nsp.emit("sheet visit count", num);
            });
            
            sheet_user_count++;
            site_user_count++;
            
            console.log(
                "connection - " +
                    site_user_count +
                    " users in site, " +
                    sheet_user_count +
                    " users in sheet " +
                    namespace
            );

            nsp.emit("user count", sheet_user_count);
            
            users[session_id] = {focus:-1};
            
            var chat = livechat(namespace, nsp, socket, user);
            
            /*
              Build array containing array of nicknames
              of user focussing on each cell
              
              [
              ["Paul","Anonymous"],
              [],
              ["George"]
              ]
              
              Goal: show the users who's editing what.
              
            */
            function send_focus_index(){
                var fi = [];
                
                for(var i = 0; i < model.get_length(); i++){
                    fi.push([]);
                }
                
                if(!model.is_locked()){
                    for(var i in users){
                        var user = users[i];
                        if(user == undefined){
                            continue;
                        }
                        if(user.focus != undefined && user.focus != -1){
                            fi[user.focus].push(user.nickname);
                        }
                    }
                }
                nsp.emit("focus index", fi);
            }
            
            // Send sheet to user
            socket.emit("sheet", JSON.stringify(model.get_sheet()));
            
            socket.on("set nickname",function(data){
                // Prevent XSS
                // Prevent injection of whatever dom element here
                // by allowing only certain characters
                var nickname = data.nickname.replace(/[^A-Za-z0-9\-]/g,"");
                
                if(registered){
                    user.fetch_permanent_user(function(){
                        user.set_nickname(nickname);
                        // Store in redis
                        user.save();
                        // And in mongo
                        user.save_permanent();
                    });
                } else {
                    user.set_nickname(nickname);
                }
                
                users[session_id].nickname = nickname;
                
                send_focus_index();
            });
            
            function send_user_data(){
                socket.emit("user data", user.get_public_data());
            }
            
            socket.on("set focus",function(data){
                if(model.is_locked()){
                    return;
                }
                
                var index = data.index;
                users[session_id].focus = index;
                
                send_focus_index();
            });

            
            socket.on("lock sheet",function(data){
                // Don't lock demo
                if(namespace == "demo"){
                    return;
                }
                
                // Already locked?
                if(model.is_locked()){
                    return;
                }
                
                model.lock();
                save(true);
                
                send_focus_index();
                
                socket.emit("sheet locked", {
                    initiator: users[session_id].nickname
                });
            });
            
            socket.on("edit cell", function(data){
                if(!model.is_locked()){
                    model.edit(data);
                    socket.broadcast.emit("edit cell", data);
                    save();
                }
            });
            
            socket.on("delete cell", function(data){
                if(!model.is_locked()){
                    model.remove(data);

                    save();
                    socket.broadcast.emit("delete cell", data);
                }
            });
            
            socket.on("disconnect",function(socket){                
                sheet_user_count--;
                site_user_count--;

                console.log(
                    "disconnection - " +
                        site_user_count +
                        " users in site, " +
                        sheet_user_count +
                        " users in sheet " +
                        namespace
                );
                
                nsp.emit("user count", sheet_user_count);
                
                if(registered){
                    // Save user in memory
                    user.save();
                }
                
                /*
                  Delete user from memory.

                  What if user is in 2 tabs: 
                  If the user is there 2 times in 2 tabs,
                  it will be recreated after the user sends back it's
                  focus. So there is no problem in deleting.
                  
                  This is necessary to avoid ending up with enormous
                  amounts of users in this array.
                 */
                delete users[session_id];
                send_focus_index();
            });
        });

        function save(even_if_locked){
            var even_if_locked = even_if_locked || false;
            if(!model.is_locked() || even_if_locked){
                sheet_db.store_sheet(namespace, model.get_sheet());
            }
        }
    }
}
