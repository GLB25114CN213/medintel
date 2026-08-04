import jwt from "jsonwebtoken";

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ success: false, error: "Access denied. Authentication token required." });
  }

  try {
    const secret = process.env.JWT_SECRET || "medintel_jwt_secret_fallback";
    const verified = jwt.verify(token, secret);
    req.user = verified;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, error: "Invalid or expired session token." });
  }
};

export const optionalAuthenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token) {
    try {
      const secret = process.env.JWT_SECRET || "medintel_jwt_secret_fallback";
      req.user = jwt.verify(token, secret);
    } catch (e) {
      // Ignored for optional auth
    }
  }
  next();
};
