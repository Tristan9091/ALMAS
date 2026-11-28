import { useState } from "react";
import { graphqlRequest } from "../../graphql/client";
import { traducir, rutaLocalizada } from "../../i18n/utils";
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

export default function RegisterForm({ idioma = "es" }) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const t = (es, en) => traducir(idioma, es, en);

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      await graphqlRequest(REGISTER_MUTATION, {
        nombre,
        email,
        password,
      });

      window.location.href = rutaLocalizada("/login", idioma);
    } catch (err) {
      console.error(err);

      setError(
        idioma === "es"
          ? err.message || "No se pudo crear la cuenta."
          : "Could not create your account. Please check your information and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit} aria-busy={loading}>
      <h1>{t("Crear cuenta", "Create an account")}</h1>

      <p className="auth-subtitle">
        {t("Regístrate para comenzar a comprar", "Sign up to start shopping")}
      </p>

      <label>
        {t("Nombre", "Name")}

        <input
          type="text"
          name="nombre"
          autoComplete="name"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
        />
      </label>

      <label>
        {t("Correo", "Email")}

        <input
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>

      <label>
        {t("Contraseña", "Password")}

        <input
          type="password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading}>
        {loading
          ? t("Creando cuenta...", "Creating account...")
          : t("Crear cuenta", "Create account")}
      </button>

      <p className="auth-link">
        {t("¿Ya tienes cuenta?", "Already have an account?")}{" "}
        <a href={rutaLocalizada("/login", idioma)}>
          {t("Iniciar sesión", "Sign in")}
        </a>
      </p>
    </form>
  );
}
