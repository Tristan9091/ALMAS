import { useState } from "react";
import { graphqlRequest } from "../graphql/client";
import "../../styles/auth.css";

const LOGIN_MUTATION = `
    mutation Login($email: String!, $password: String!) {
        login(
            data: {
                email: $email
                password: $password
            }
        ) {
            token
            usuario {
                id
                nombre
                email
            }
        }
    }
`;

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      const result = await graphqlRequest(LOGIN_MUTATION, {
        email,
        password,
      });

      const { token, usuario } = result.login;

      localStorage.setItem("almas-token", token);
      localStorage.setItem("almas-user", JSON.stringify(usuario));

      window.location.href = "/";
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo iniciar sesión.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h1>Iniciar sesión</h1>
      <p className="auth-subtitle">Bienvenido de nuevo a ALMĀS</p>

      <label>
        Correo
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>

      <label>
        Contraseña
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>

      {error && <p className="error">{error}</p>}

      <button type="submit" disabled={loading}>
        {loading ? "Entrando..." : "Iniciar sesión"}
      </button>

      <p className="auth-link">
        ¿No tienes cuenta? <a href="/registro">Crear cuenta</a>
      </p>
    </form>
  );
}
