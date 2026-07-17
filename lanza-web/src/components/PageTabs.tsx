import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

type Tab = { to: string; label: string; end?: boolean };

type Props = {
  tabs: Tab[];
  children?: ReactNode;
  ariaLabel?: string;
};

export function PageTabs({ tabs, children, ariaLabel = "Secções" }: Props) {
  return (
    <>
      <nav className="tabs" aria-label={ariaLabel}>
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              isActive ? "tabs__link tabs__link--active" : "tabs__link"
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      {children}
    </>
  );
}
