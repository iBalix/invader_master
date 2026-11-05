-- Tournoi : trois modeles prets (echecs, Mario Kart, Smash Bros).
--
-- Aucune table nouvelle. Les boutons de lancement de la console envoient
-- deja la meme configuration a POST /api/game : cette migration ne sert
-- qu'a les retrouver dans « Mes evenements » apres un redeploiement.
--
-- A coller dans le SQL Editor Supabase. Ne pas l'executer depuis le depot.
-- Idempotente : un nom deja present (index unique sur lower(name)) est laisse tel quel.

INSERT INTO public.competition_templates (name, mode, config)
SELECT
  'Tournoi d''échecs',
  'tournament',
  '{"title":"Tournoi d''échecs","templateId":null,"templateName":null,"format":"swiss","game":"chess","groupSize":2,"placementPoints":[4,3,2,1],"poolWinPoints":1,"grouping":"swiss","parallelSlots":1,"registrationMin":10,"lateJoin":true,"plannedRounds":null,"match":{"games":1,"decide":"best_of","scoring":"match"},"points":{"win":2,"draw":1,"loss":0,"forfeit":2,"bye":2},"byePolicy":"floater","display":{"standingsMs":8000,"roundMs":8000,"liveMs":45000},"wifiSsid":"INVADER BAR","wifiPassword":"","texts":{"winner":"Bravo #winner# !"},"testMode":false}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.competition_templates WHERE lower(name) = lower('Tournoi d''échecs')
);

INSERT INTO public.competition_templates (name, mode, config)
SELECT
  'Tournoi Mario Kart',
  'tournament',
  '{"title":"Tournoi Mario Kart","templateId":null,"templateName":null,"format":"waves","game":"mariokart","groupSize":4,"placementPoints":[4,3,2,1],"poolWinPoints":1,"grouping":"swiss","parallelSlots":2,"registrationMin":10,"lateJoin":true,"plannedRounds":3,"match":{"games":1,"decide":"best_of","scoring":"match"},"points":{"win":4,"draw":3,"loss":2,"forfeit":1,"bye":0},"byePolicy":"floater","display":{"standingsMs":8000,"roundMs":8000,"liveMs":45000},"wifiSsid":"INVADER BAR","wifiPassword":"","texts":{"winner":"Bravo #winner# !"},"testMode":false}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.competition_templates WHERE lower(name) = lower('Tournoi Mario Kart')
);

INSERT INTO public.competition_templates (name, mode, config)
SELECT
  'Tournoi Smash Bros',
  'tournament',
  '{"title":"Tournoi Smash Bros","templateId":null,"templateName":null,"format":"waves","game":"smash","groupSize":2,"placementPoints":[4,3,2,1],"poolWinPoints":1,"grouping":"swiss","parallelSlots":2,"registrationMin":10,"lateJoin":true,"plannedRounds":3,"match":{"games":1,"decide":"best_of","scoring":"match"},"points":{"win":1,"draw":0,"loss":0,"forfeit":1,"bye":0},"byePolicy":"floater","display":{"standingsMs":8000,"roundMs":8000,"liveMs":45000},"wifiSsid":"INVADER BAR","wifiPassword":"","texts":{"winner":"Bravo #winner# !"},"testMode":false}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.competition_templates WHERE lower(name) = lower('Tournoi Smash Bros')
);
