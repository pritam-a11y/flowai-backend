// Dummy auth middleware for precision backend
// This backend doesn't use authentication, all requests are allowed

const authMiddleware = (req, res, next) => {
  // Skip authentication for precision backend
  // Set dummy user for compatibility with existing code
  req.user = {
    id: 1,
    email: 'precision@flowai.com',
    role: 'admin'
  };
  next();
};

module.exports = authMiddleware;