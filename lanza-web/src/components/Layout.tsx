import { useState } from "react";

import { NavLink, Outlet } from "react-router-dom";

import { useHealth } from "@/api/hooks";

import { getApiBaseUrl } from "@/api/client";

import { useAuth } from "@/context/AuthContext";

import { ApiKeyBanner } from "./ApiKeyBanner";
import { BrandMark } from "./BrandMark";
import { RastreameEspelhoToggle } from "./RastreameEspelhoToggle";



const nav = [

  { to: "/", label: "Dashboard", end: true },

  { to: "/clientes", label: "Clientes" },

  { to: "/veiculos", label: "Veículos" },

  { to: "/parceiros", label: "Parceiros" },

  { to: "/contratos", label: "Contratos" },

  { to: "/movimentacao", label: "Movimentação" },

  { to: "/recebimentos", label: "Recebimentos" },

  { to: "/sync", label: "Syncs" },

  { to: "/despesas", label: "Despesas" },

  { to: "/relatorios", label: "Relatórios" },

];



export function Layout() {

  const health = useHealth();

  const { user, logout } = useAuth();

  const [apiKeyOpen, setApiKeyOpen] = useState(false);

  const apiBase = getApiBaseUrl();



  return (

    <div className="app-shell">

      <aside className="sidebar">

        <div className="brand">
          <BrandMark variant="sidebar" />
          <div>
            <strong>Lanza</strong>
            <span className="brand__sub">Painel operacional</span>
          </div>
        </div>



        <nav className="nav">

          {nav.map((item) => (

            <NavLink

              key={item.to}

              to={item.to}

              end={item.end}

              className={({ isActive }) =>

                isActive ? "nav__link nav__link--active" : "nav__link"

              }

            >

              {item.label}

            </NavLink>

          ))}

        </nav>



        <footer className="sidebar__footer">
          <RastreameEspelhoToggle />
          {user ? (

            <div className="sidebar__user">

              <strong>{user.name}</strong>

              <span>{user.email}</span>

              <button type="button" className="sidebar__link-btn" onClick={logout}>

                Sair

              </button>

            </div>

          ) : null}

          <a

            href={apiBase ? `${apiBase}/api/docs` : "/api/docs"}

            target="_blank"

            rel="noreferrer"

            className="sidebar__docs"

          >

            Documentação API

          </a>

          <button

            type="button"

            className="sidebar__link-btn"

            onClick={() => setApiKeyOpen(true)}

          >

            Chave API

          </button>

          <span className="sidebar__status">

            {health.isLoading && "Conectando…"}

            {health.isError && "API offline"}

            {health.isSuccess && (

              <>

                API v{health.data.version}

                {health.data.database?.backend

                  ? ` · DB ${health.data.database.backend}`

                  : null}

                {health.data.database?.postgres?.ok === false ? " · PG erro" : null}

              </>

            )}

          </span>

          {apiBase ? <span className="sidebar__api-url">{apiBase}</span> : null}

        </footer>

      </aside>



      <main className="main">

        <ApiKeyBanner open={apiKeyOpen} onClose={() => setApiKeyOpen(false)} />

        <Outlet />

      </main>

    </div>

  );

}

