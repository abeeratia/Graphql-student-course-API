import jwt from "jsonwebtoken";

export const createToken = (user) => {
  return jwt.sign(
    { id: user.id || user._id, email: user.email },
    process.env.SECRET_KEY,
    { expiresIn: "7d" }
  );
};

export const getUserFromToken = (authHeader) => {
  try {
    if (!authHeader) return null;
    const token = authHeader.replace("Bearer ", "");
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    return decoded;
  } catch (err) {
    return null;
  }
};
