/* cache_user_model.js */

/* todo: untangle this and user_db.js */

var db = require("./user_db");
var user_cache = require("./user_cache");

module.exports = {};

module.exports.db = db;

module.exports.cached_user = cached_user;

function cached_user(session_id, public_id){
    var exports = {};

    var data = {
        public_id: public_id || "",
        session_id: session_id || "",
        username: "Anonymous",
        permanent_id: null,
        recent_sheets: [],
        fb_id: "",
        name: ""
    };

    var permanent_user = null;

    exports.get_permanent_user = function(){
        return permanent_user;
    };

    exports.set_permanent_user = set_permanent_user;
    
    function set_permanent_user(new_permanent_user){
        permanent_user = new_permanent_user;
        data.username = permanent_user.username;
        data.email = permanent_user.email;
        data.name = permanent_user.name;
        data.fb_id = permanent_user.fb_id;
        data.permanent_id = permanent_user.id;
        data.recent_sheets = permanent_user.recent_sheets;
    }

    exports.visit_sheet = visit_sheet;

    /*
      Can be an array or a single element
     */
    function visit_sheet(sheet){
        user_cache.visit_sheet(data.permanent_id, sheet);
    }

    exports.recently_visited_sheets = recently_visited_sheets;
    
    function recently_visited_sheets(callback){
        user_cache.recently_visited_sheets(
            data.permanent_id, callback
        );
    }
    
    exports.fetch_permanent_user = fetch_permanent_user;

    /*
      Find user in mongo 
      to prepare for update
     */
    function fetch_permanent_user(callback){
        if(data.permanent_id == null){
            console.log("Error: cannot fetch permanent user. "+
                        "permanent_id is not known.");
        }
        
        db.get_user_by_id(data.permanent_id, function(user){
            if(user == null){
                console.log("Error: permanent id not linked to a user.");
                return;
            }
            set_permanent_user(user);
            callback();
        });
    }
    
    /*
      Save in mongo
    */
    exports.save_permanent = function(){
        permanent_user.save();
    };

    exports.set_name = function(name){
        data.name = name;
    };

    exports.get_name = function(){
        return data.name;
    };

    exports.set_fb_id = function(fb_id){
        data.fb_id = fb_id;
    };

    exports.get_fb_id = function(){
        return data.fb_id;
    };
    
    /*
      Save in cache
     */
    exports.save = function(){
        user_cache.store_user(data.session_id, data);
    };

    /*
      Fetch from cache
      callback()
     */
    exports.fetch = function(callback){
        user_cache.get_user( data.session_id, function(from_cache){
            data = from_cache;
            callback();
        });
    };
    
    /*
      Should be only data safe for frontend
     */
    exports.get_public_data = function(){
        return {
            public_id: data.public_id,
            username: data.username,
            focus: -1
        }
    };
    
    exports.get_public_id = function(){
        return data.public_id;
    };

    exports.get_username = function(){
        return data.username;
    };
    
    exports.set_public_id = function(new_id){
        data.public_id = new_id;
    };

    exports.get_session_id = function(){
        return data.session_id;
    };
    
    exports.set_session_id = function(new_id){
        data.session_id = new_id;
    };
    
    exports.set_username = function(new_username){
        if(permanent_user != null){
            permanent_user.username = new_username;
            permanent_user.save();
        }
        data.username = new_username;
    };

    exports.get_username = function(){
        return data.username;
    };

    exports.set_email = function(new_email){
        if(permanent_user != null){
            permanent_user.email = new_email;
            permanent_user.save();
        }
        data.email = new_email;
    };

    exports.get_email = function(){
        return data.email;
    };

    return exports;
}

module.exports.create = function(){
    var session_id = require("./tokens").generate_token(6);
    var public_id = require("./tokens").generate_token(6);
    return cached_user(session_id, public_id);
};

module.exports.temp_exists = function(id, callback){
    user_cache.exists(id, callback);
};

module.exports.logout = function(session_id){
    user_cache.logout(session_id);
};
