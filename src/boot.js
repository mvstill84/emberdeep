// ===== Boot =====
Meta.load();
Render.init();
Input.init(Render.cv);
Menu.el = document.getElementById('menu');
Menu.el.addEventListener('pointerdown', () => Snd.init());
Menu.show('title');
requestAnimationFrame(t => Game.frame(t));
window.__emberdeep = { Game, World, Meta, Render };
