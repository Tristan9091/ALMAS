import { useState } from "react";
import { graphqlRequest } from "../../graphql/client";
import { traducir, rutaLocalizada } from "../../i18n/utils";
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

export default function LoginForm({ idioma = "es" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const t = (es, en) => traducir(idioma, es, en);

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

      window.location.href = rutaLocalizada("/", idioma);
    } catch (err) {
      console.error(err);

      setError(
        idioma === "es"
          ? err.message || "No se pudo iniciar sesión."
          : "Could not sign in. Please check your credentials and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit} aria-busy={loading}>
      <h1>{t("Iniciar sesión", "Sign in")}</h1>

      <p className="auth-subtitle">
        {t("Bienvenido de nuevo a ALMĀS", "Welcome back to ALMĀS")}
      </p>

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
          autoComplete="current-password"
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
          ? t("Entrando...", "Signing in...")
          : t("Iniciar sesión", "Sign in")}
      </button>

      <p className="auth-link">
        {t("¿No tienes cuenta?", "Don't have an account?")}{" "}
        <a href={rutaLocalizada("/registro", idioma)}>
          {t("Crear cuenta", "Create an account")}
        </a>
      </p>
    </form>
  );
}
