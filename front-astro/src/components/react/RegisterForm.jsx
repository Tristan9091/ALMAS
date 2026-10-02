import { useState } from "react";
import "../../styles/auth.css";

const REGISTER_MUTATION = `
  mutation Registrar(
    $nombre: String!,
    $email: String!,
    $password: String!
  ) {
    registrarUsuario(
      data: {
        nombre: $nombre
        email: $email
        password: $password
      }
    ) {
      id
      nombre
      email
    }
  }
`;

export default function RegisterForm() {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await fetch("http://127.0.0.1:8000/graphql", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          query: REGISTER_MUTATION,

          variables: {
            nombre,
            email,
            password,
          },
        }),
      });

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      window.location.href = "/login";
    } catch (err) {
      console.error(err);

      setError(err.message || "No se pudo crear la cuenta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h1>Crear cuenta</h1>

      <p className="auth-subtitle">Regístrate para comenzar a comprar</p>

      <label>
        Nombre
        <input
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
        />
      </label>

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
        {loading ? "Creando cuenta..." : "Crear cuenta"}
      </button>

      <p className="auth-link">
        ¿Ya tienes cuenta? <a href="/login">Iniciar sesión</a>
      </p>
    </form>
  );
}
