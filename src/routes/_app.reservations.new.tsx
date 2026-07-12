import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/reservations/new")({
  component: Teste,
});

function Teste() {
  return (
    <div style={{ padding: 40 }}>
      <h1 style={{ fontSize: 40 }}>FUNCIONOU</h1>
    </div>
  );
}
