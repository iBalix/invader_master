-- Seed des cles de traduction pour les tables tactiles V2.
-- A executer dans le SQL Editor du dashboard Supabase.
--
-- Toutes les cles utilisent un prefixe "table." pour eviter les collisions
-- avec les autres surfaces (projecteur, TV, back-office...).

INSERT INTO public.translations (key, value_fr, value_en) VALUES

-- ============================================================
-- COMMUNS
-- ============================================================
('table.common.back', 'Retour', 'Back'),
('table.common.home', 'Accueil', 'Home'),
('table.common.cancel', 'Annuler', 'Cancel'),
('table.common.confirm', 'Confirmer', 'Confirm'),
('table.common.close', 'Fermer', 'Close'),
('table.common.loading', 'Chargement...', 'Loading...'),
('table.common.error', 'Une erreur est survenue', 'An error occurred'),
('table.common.retry', 'Reessayer', 'Retry'),
('table.cancel', 'Annuler', 'Cancel'),
('table.retry', 'Reessayer', 'Retry'),

-- ============================================================
-- ECRAN DE VEILLE
-- ============================================================
('table.screensaver.tap', 'Touchez pour commencer', 'Tap to start'),
('table.screensaver.welcome', 'Bienvenue', 'Welcome'),
('table.screensaver.featured', 'Mis en avant', 'Featured'),
('table.screensaver.tagline', 'Bar / Retro Gaming', 'Bar / Retro Gaming'),

-- ============================================================
-- ECRAN D''ACCUEIL
-- ============================================================
('table.home.title.line1', 'Prenez', 'Take'),
('table.home.title.line2', 'les commandes', 'control'),
('table.home.cta.menu', 'Carte', 'Menu'),
('table.home.cta.menu.subtitle', 'Boissons & nourriture', 'Drinks & food'),
('table.home.cta.games', 'Jeux', 'Games'),
('table.home.cta.games.subtitle', 'Lance ta partie', 'Start playing'),
('table.home.help', 'Aide', 'Help'),
('table.home.help.title', 'Comment ca marche ?', 'How does it work?'),
('table.home.event.live', 'Event en cours', 'Live event'),
('table.home.event.upcoming', 'A venir', 'Upcoming'),
('table.home.event.join', 'Rejoindre', 'Join'),

-- ============================================================
-- ECRAN CARTE
-- ============================================================
('table.menu.title', 'Carte', 'Menu'),
('table.menu.cart', 'Panier', 'Cart'),
('table.menu.cart.empty', 'Votre panier est vide', 'Your cart is empty'),
('table.menu.cart.subtotal', 'Sous-total', 'Subtotal'),
('table.menu.cart.happyhour', 'Happy Hour', 'Happy Hour'),
('table.menu.cart.coupon', 'Code promo', 'Promo code'),
('table.menu.cart.coupon.apply', 'Appliquer', 'Apply'),
('table.menu.cart.coupon.invalid', 'Code invalide', 'Invalid code'),
('table.menu.cart.total', 'Total', 'Total'),
('table.menu.cart.checkout', 'Passer commande', 'Checkout'),
('table.menu.checkout.title', 'Comment voulez-vous payer ?', 'How would you like to pay?'),
('table.menu.checkout.card', 'Carte bancaire', 'Credit card'),
('table.menu.checkout.cash', 'Especes', 'Cash'),
('table.menu.checkout.card.info', 'Commande envoyee au bar. Le barman vous apportera la commande et le module de paiement des qu''elle sera prete.', 'Order sent to the bar. The bartender will bring your order and the payment device when it''s ready.'),
('table.menu.checkout.cash.info', 'Rendez-vous au bar pour regler. Le serveur vous apportera la commande des qu''elle sera prete.', 'Please go to the bar to pay. The server will bring your order when it''s ready.'),
('table.menu.checkout.confirm', 'Confirmer la commande', 'Confirm order'),
('table.menu.checkout.success', 'Commande envoyee !', 'Order sent!'),

-- ============================================================
-- MODALE PAIEMENT (CHECKOUT)
-- ============================================================
('table.checkout.title.choose', 'PASSER COMMANDE', 'CHECKOUT'),
('table.checkout.title.done', 'COMMANDE VALIDEE', 'ORDER CONFIRMED'),
('table.checkout.title.error', 'OUPS', 'OOPS'),
('table.checkout.howpay', 'Comment souhaites-tu payer ta commande de', 'How would you like to pay your order of'),
('table.checkout.card', 'CARTE BANCAIRE', 'CREDIT CARD'),
('table.checkout.card.hint', 'Le barman vient avec le module', 'Bartender brings the device'),
('table.checkout.cash', 'ESPECES', 'CASH'),
('table.checkout.cash.hint', 'A regler au bar', 'Pay at the bar'),
('table.checkout.sending', 'Envoi de la commande...', 'Sending order...'),
('table.checkout.sending.hint', 'Ne ferme pas l''ecran', 'Do not close the screen'),
('table.checkout.order', 'Commande', 'Order'),
('table.checkout.done.card', 'Ta commande est partie au bar. Un barman te l''apporte directement avec le module de paiement des qu''elle est prete.', 'Your order has been sent to the bar. The bartender will bring it directly with the payment device when ready.'),
('table.checkout.done.cash', 'Rendez-vous au bar pour regler ta commande maintenant. Le serveur te l''apportera des qu''elle est prete.', 'Please go to the bar to pay now. The server will bring your order when ready.'),
('table.checkout.ok', 'Compris', 'Got it'),
('table.checkout.error', 'Impossible d''envoyer la commande', 'Unable to send the order'),

-- ============================================================
-- ECRAN JEUX
-- ============================================================
('table.games.title', 'Jeux', 'Games'),
('table.games.all', 'Tous', 'All'),
('table.games.empty', 'Aucun jeu dans cette categorie', 'No games in this category'),
('table.games.launch', 'Lancer le jeu', 'Launch game'),
('table.games.launching', 'Lancement...', 'Launching...'),
('table.games.before', 'Avant de lancer', 'Before launching'),
('table.games.steps.title', 'Pour jouer', 'How to play'),
('table.games.step1.title', 'Passez commande au comptoir', 'Order at the bar'),
('table.games.step1.desc', 'Une boisson minimum est demandee pour pouvoir jouer.', 'A minimum drink purchase is required to play.'),
('table.games.step2.title', 'Recuperez les manettes', 'Pick up the controllers'),
('table.games.step2.desc', 'Selon le jeu, demandez les manettes au bar.', 'Depending on the game, ask for controllers at the bar.'),
('table.games.step3.title', 'Quitter le jeu', 'Quit the game'),
('table.games.step3.desc', 'Maintenez la touche START pendant 3 secondes.', 'Hold START for 3 seconds.'),
('table.games.slave.title', 'Lancement depuis le master', 'Launch from master screen'),
('table.games.slave.info', 'Le lancement d''un jeu se fait depuis l''ecran principal de la table. Cet ecran prendra automatiquement le relais.', 'Games are launched from the main screen of the table. This screen will automatically follow.'),
('table.games.error.missing', 'Ce jeu ne peut pas etre lance (configuration manquante).', 'This game cannot be launched (missing configuration).'),
('table.games.error.launch', 'Erreur au lancement', 'Launch error'),

-- ============================================================
-- IN-GAME OVERLAY
-- ============================================================
('table.ingame.playing', 'Partie en cours', 'Game in progress'),
('table.ingame.howto.quit', 'Maintenez START pendant 3 secondes pour quitter', 'Hold START for 3 seconds to quit'),
('table.ingame.end', 'Terminer la partie', 'End game')

ON CONFLICT (key) DO NOTHING;

-- Fin seed translations tables V2
