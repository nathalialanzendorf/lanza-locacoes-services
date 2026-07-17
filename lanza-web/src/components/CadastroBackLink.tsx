import { Link } from "react-router-dom";

type Props = {
  to: string;
  label?: string;
};

export function CadastroBackLink({ to, label = "Voltar à listagem" }: Props) {
  return (
    <p className="cadastro-back">
      <Link to={to} className="btn btn--ghost btn--sm">
        ← {label}
      </Link>
    </p>
  );
}
