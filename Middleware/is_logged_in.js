async function isAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
      return next();
    }
    res.redirect('/notfound');
  }
  

  module.exports = isAuthenticated;
  