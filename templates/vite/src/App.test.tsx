// Starter test for the App that create-vite generates. It shows the test setup
// working on a fresh scaffold. Delete it when you replace App with your own.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("counts clicks on the counter button", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Count is 0" }));

    expect(screen.getByRole("button", { name: "Count is 1" })).toBeInTheDocument();
  });
});
