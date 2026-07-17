import { closePgPool, pgQuery } from "@lanza/db";

const USER_ID = "f129bab1-6373-44c1-88cd-eb9ea701ff22";
const EMAIL = "lanza.locacoes@gmail.com";
const NAME = "Lanza ADMIN";

async function main(): Promise<void> {
  const result = await pgQuery<{ email: string; name: string }>(
    `UPDATE lanza.users
     SET email = $1, name = $2, updated_at = now()
     WHERE id = $3
     RETURNING email, name`,
    [EMAIL, NAME, USER_ID],
  );

  if (result.rowCount) {
    console.log("Postgres atualizado:", result.rows[0]);
  } else {
    console.log("Utilizador não encontrado no Postgres (apenas JSON local).");
  }
}

main()
  .catch((err) => {
    console.log("Postgres:", err instanceof Error ? err.message : err);
  })
  .finally(() => closePgPool());
