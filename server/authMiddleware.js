import { verifyCognitoToken, getCognitoConfig } from "./cognito.js";
import { getQuery, runQuery } from "./db.js";

export const authenticateToken = async (req, res, next) => {
  const { isConfigured } = getCognitoConfig();
  if (!isConfigured) {
    return res.status(500).json({
      success: false,
      error: "Cognito Authentication is not configured. Please set COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, and COGNITO_REGION in environment variables."
    });
  }

  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ success: false, error: "Access denied. Cognito session token required." });
  }

  try {
    const cognitoClaims = await verifyCognitoToken(token);
    const sub = cognitoClaims.sub;

    // Find or link user record by cognito_sub
    let userRow = await getQuery("SELECT * FROM users WHERE cognito_sub = ?", [sub]);
    if (!userRow) {
      userRow = await getQuery("SELECT * FROM users WHERE email = ?", [cognitoClaims.email]);
      if (userRow) {
        await runQuery("UPDATE users SET cognito_sub = ? WHERE id = ?", [sub, userRow.id]);
        userRow.cognito_sub = sub;
      } else {
        const result = await runQuery(
          "INSERT INTO users (cognito_sub, email, full_name) VALUES (?, ?, ?)",
          [sub, cognitoClaims.email, cognitoClaims.name]
        );
        userRow = { id: result.id, cognito_sub: sub, email: cognitoClaims.email, full_name: cognitoClaims.name };
      }
    }

    // Find or create associated patient record by cognito_sub
    let patientRow = await getQuery("SELECT * FROM patients WHERE cognito_sub = ?", [sub]);
    if (!patientRow) {
      const pid = "MI-PAT-" + Math.floor(100000 + Math.random() * 900000);
      await runQuery(
        "INSERT INTO patients (user_id, cognito_sub, patient_id, full_name, email) VALUES (?, ?, ?, ?, ?)",
        [userRow.id, sub, pid, cognitoClaims.name, cognitoClaims.email]
      );
      patientRow = await getQuery("SELECT * FROM patients WHERE cognito_sub = ?", [sub]);
    }

    req.user = {
      id: userRow.id,
      sub: userRow.cognito_sub,
      email: userRow.email,
      full_name: userRow.full_name,
      patient_id: patientRow ? patientRow.patient_id : "MI-PAT-100245"
    };

    next();
  } catch (err) {
    return res.status(403).json({ success: false, error: "Invalid or expired Cognito session token." });
  }
};

export const optionalAuthenticateToken = async (req, res, next) => {
  const { isConfigured } = getCognitoConfig();
  if (!isConfigured) return next();

  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token) {
    try {
      const cognitoClaims = await verifyCognitoToken(token);
      const sub = cognitoClaims.sub;

      let userRow = await getQuery("SELECT * FROM users WHERE cognito_sub = ?", [sub]);
      if (userRow) {
        let patientRow = await getQuery("SELECT * FROM patients WHERE cognito_sub = ?", [sub]);
        req.user = {
          id: userRow.id,
          sub: userRow.cognito_sub,
          email: userRow.email,
          full_name: userRow.full_name,
          patient_id: patientRow ? patientRow.patient_id : "MI-PAT-100245"
        };
      }
    } catch (e) {
      // Ignored for optional auth
    }
  }
  next();
};
