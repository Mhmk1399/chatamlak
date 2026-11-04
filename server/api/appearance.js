import { createAppearanceService } from "../lib/services/appearanceService.js";

export function registerAppearanceRoutes(app, deps) {
  const service = createAppearanceService(deps);
  app.put("/api/profile/appearance", async (req, res) => {
    const session = await deps.requireSession(req, res);
    if (!session) return;
    res.setHeader("Cache-Control", "private, no-store");
    const result = await service.save(session, req.body);
    return res.status(result.status).json(result.body);
  });
}
