/**
 * Traductions par defaut (fallback) pour les tables tactiles.
 *
 * Le hook `useT` cherche d'abord la cle dans le dictionnaire fetche
 * depuis `/public/translations?locale=...`. Si la cle est absente,
 * il retombe sur ce fichier (qui doit etre maintenu en miroir avec
 * `docs/seed-translations-tables-v2.sql`).
 *
 * Les chaines ici servent aussi de documentation des cles utilisees.
 */

export type Locale = 'fr' | 'en';

export const DEFAULT_TRANSLATIONS: Record<Locale, Record<string, string>> = {
  fr: {
    // commun
    'table.common.back': 'Retour',
    'table.common.home': 'Accueil',
    'table.common.cancel': 'Annuler',
    'table.common.confirm': 'Confirmer',
    'table.common.close': 'Fermer',
    'table.common.loading': 'Chargement...',
    'table.common.error': 'Une erreur est survenue',
    'table.common.retry': 'Reessayer',
    'table.cancel': 'Annuler',
    'table.retry': 'Reessayer',

    // veille
    'table.screensaver.tap': 'Touchez pour commencer',
    'table.screensaver.welcome': 'Bienvenue',
    'table.screensaver.featured': 'Mis en avant',
    'table.screensaver.tagline': 'Bar / Retro Gaming',

    // accueil
    'table.home.title.line1': 'Prenez',
    'table.home.title.line2': 'les commandes',
    'table.home.cta.menu': 'Carte',
    'table.home.cta.menu.subtitle': 'Boissons & nourriture',
    'table.home.cta.games': 'Jeux',
    'table.home.cta.games.subtitle': 'Lance ta partie',
    'table.home.help': 'Aide',
    'table.home.help.title': 'Comment ca marche ?',
    'table.home.event.live': 'Event en cours',
    'table.home.event.upcoming': 'A venir',
    'table.home.event.join': 'Rejoindre',

    // carte
    'table.menu.title': 'Carte',
    'table.menu.cart': 'Panier',
    'table.menu.cart.empty': 'Votre panier est vide',
    'table.menu.cart.subtotal': 'Sous-total',
    'table.menu.cart.happyhour': 'Happy Hour',
    'table.menu.cart.coupon': 'Code promo',
    'table.menu.cart.coupon.apply': 'Appliquer',
    'table.menu.cart.coupon.invalid': 'Code invalide',
    'table.menu.cart.total': 'Total',
    'table.menu.cart.checkout': 'Passer commande',
    'table.menu.checkout.title': 'Comment voulez-vous payer ?',
    'table.menu.checkout.card': 'Carte bancaire',
    'table.menu.checkout.cash': 'Especes',
    'table.menu.checkout.card.info':
      'Commande envoyee au bar. Le barman vous apportera la commande et le module de paiement des qu\'elle sera prete.',
    'table.menu.checkout.cash.info':
      'Rendez-vous au bar pour regler. Le serveur vous apportera la commande des qu\'elle sera prete.',
    'table.menu.checkout.confirm': 'Confirmer la commande',
    'table.menu.checkout.success': 'Commande envoyee !',

    // checkout (modale paiement)
    'table.checkout.title.choose': 'PASSER COMMANDE',
    'table.checkout.title.done': 'COMMANDE VALIDEE',
    'table.checkout.title.error': 'OUPS',
    'table.checkout.howpay': 'Comment souhaites-tu payer ta commande de',
    'table.checkout.card': 'CARTE BANCAIRE',
    'table.checkout.card.hint': 'Le barman vient avec le module',
    'table.checkout.cash': 'ESPECES',
    'table.checkout.cash.hint': 'A regler au bar',
    'table.checkout.sending': 'Envoi de la commande...',
    'table.checkout.sending.hint': 'Ne ferme pas l\'ecran',
    'table.checkout.order': 'Commande',
    'table.checkout.done.card':
      'Ta commande est partie au bar. Un barman te l\'apporte directement avec le module de paiement des qu\'elle est prete.',
    'table.checkout.done.cash':
      'Rendez-vous au bar pour regler ta commande maintenant. Le serveur te l\'apportera des qu\'elle est prete.',
    'table.checkout.ok': 'Compris',
    'table.checkout.error': 'Impossible d\'envoyer la commande',

    // jeux
    'table.games.title': 'Jeux',
    'table.games.all': 'Tous',
    'table.games.empty': 'Aucun jeu dans cette categorie',
    'table.games.launch': 'Lancer le jeu',
    'table.games.launching': 'Lancement...',
    'table.games.before': 'Avant de lancer',
    'table.games.steps.title': 'Pour jouer',
    'table.games.step1.title': 'Passez commande au comptoir',
    'table.games.step1.desc': 'Une boisson minimum est demandee pour pouvoir jouer.',
    'table.games.step2.title': 'Recuperez les manettes',
    'table.games.step2.desc': 'Selon le jeu, demandez les manettes au bar.',
    'table.games.step3.title': 'Quitter le jeu',
    'table.games.step3.desc': 'Maintenez la touche START pendant 3 secondes.',
    'table.games.slave.title': 'Lancement depuis le master',
    'table.games.slave.info':
      'Le lancement d\'un jeu se fait depuis l\'ecran principal de la table. Cet ecran prendra automatiquement le relais.',
    'table.games.error.missing': 'Ce jeu ne peut pas etre lance (configuration manquante).',
    'table.games.error.launch': 'Erreur au lancement',

    // in-game
    'table.ingame.playing': 'Partie en cours',
    'table.ingame.howto.quit': 'Maintenez START pendant 3 secondes pour quitter',
    'table.ingame.end': 'Terminer la partie',
  },
  en: {
    'table.common.back': 'Back',
    'table.common.home': 'Home',
    'table.common.cancel': 'Cancel',
    'table.common.confirm': 'Confirm',
    'table.common.close': 'Close',
    'table.common.loading': 'Loading...',
    'table.common.error': 'An error occurred',
    'table.common.retry': 'Retry',
    'table.cancel': 'Cancel',
    'table.retry': 'Retry',

    'table.screensaver.tap': 'Tap to start',
    'table.screensaver.welcome': 'Welcome',
    'table.screensaver.featured': 'Featured',
    'table.screensaver.tagline': 'Bar / Retro Gaming',

    'table.home.title.line1': 'Take',
    'table.home.title.line2': 'control',
    'table.home.cta.menu': 'Menu',
    'table.home.cta.menu.subtitle': 'Drinks & food',
    'table.home.cta.games': 'Games',
    'table.home.cta.games.subtitle': 'Start playing',
    'table.home.help': 'Help',
    'table.home.help.title': 'How does it work?',
    'table.home.event.live': 'Live event',
    'table.home.event.upcoming': 'Upcoming',
    'table.home.event.join': 'Join',

    'table.menu.title': 'Menu',
    'table.menu.cart': 'Cart',
    'table.menu.cart.empty': 'Your cart is empty',
    'table.menu.cart.subtotal': 'Subtotal',
    'table.menu.cart.happyhour': 'Happy Hour',
    'table.menu.cart.coupon': 'Promo code',
    'table.menu.cart.coupon.apply': 'Apply',
    'table.menu.cart.coupon.invalid': 'Invalid code',
    'table.menu.cart.total': 'Total',
    'table.menu.cart.checkout': 'Checkout',
    'table.menu.checkout.title': 'How would you like to pay?',
    'table.menu.checkout.card': 'Credit card',
    'table.menu.checkout.cash': 'Cash',
    'table.menu.checkout.card.info':
      "Order sent to the bar. The bartender will bring your order and the payment device when it's ready.",
    'table.menu.checkout.cash.info':
      "Please go to the bar to pay. The server will bring your order when it's ready.",
    'table.menu.checkout.confirm': 'Confirm order',
    'table.menu.checkout.success': 'Order sent!',

    // checkout (payment modal)
    'table.checkout.title.choose': 'CHECKOUT',
    'table.checkout.title.done': 'ORDER CONFIRMED',
    'table.checkout.title.error': 'OOPS',
    'table.checkout.howpay': 'How would you like to pay your order of',
    'table.checkout.card': 'CREDIT CARD',
    'table.checkout.card.hint': 'Bartender brings the device',
    'table.checkout.cash': 'CASH',
    'table.checkout.cash.hint': 'Pay at the bar',
    'table.checkout.sending': 'Sending order...',
    'table.checkout.sending.hint': 'Do not close the screen',
    'table.checkout.order': 'Order',
    'table.checkout.done.card':
      'Your order has been sent to the bar. The bartender will bring it directly with the payment device when ready.',
    'table.checkout.done.cash':
      'Please go to the bar to pay now. The server will bring your order when ready.',
    'table.checkout.ok': 'Got it',
    'table.checkout.error': 'Unable to send the order',

    'table.games.title': 'Games',
    'table.games.all': 'All',
    'table.games.empty': 'No games in this category',
    'table.games.launch': 'Launch game',
    'table.games.launching': 'Launching...',
    'table.games.before': 'Before launching',
    'table.games.steps.title': 'How to play',
    'table.games.step1.title': 'Order at the bar',
    'table.games.step1.desc': 'A minimum drink purchase is required to play.',
    'table.games.step2.title': 'Pick up the controllers',
    'table.games.step2.desc': 'Depending on the game, ask for controllers at the bar.',
    'table.games.step3.title': 'Quit the game',
    'table.games.step3.desc': 'Hold START for 3 seconds.',
    'table.games.slave.title': 'Launch from master screen',
    'table.games.slave.info':
      'Games are launched from the main screen of the table. This screen will automatically follow.',
    'table.games.error.missing': 'This game cannot be launched (missing configuration).',
    'table.games.error.launch': 'Launch error',

    'table.ingame.playing': 'Game in progress',
    'table.ingame.howto.quit': 'Hold START for 3 seconds to quit',
    'table.ingame.end': 'End game',
  },
};
