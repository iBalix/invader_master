-- Migration 049 - Quiz "test" : recette technique des types de questions
--
-- Objectif : un quiz jouable de bout en bout qui couvre la matrice COMPLETE
-- des cas d'usage, soit 3 types de questions x 6 configurations de media :
--
--                 | aucun | image avant | image apres | avant+apres | audio | video
--   qcm           |  p0   |     p1      |     p2      |     p3      |  p4   |  p5
--   estimation    |  p6   |     p7      |     p8      |     p9      |  p10  |  p11
--   free_text     |  p12  |     p13     |     p14     |     p15     |  p16  |  p17
--
-- Le `theme` de chaque question porte le nom du cas testé : il s'affiche en
-- gros titre sur le projo (ScreenApp) et sur le mobile joueur (PlayerApp),
-- donc on lit directement quel cas est à l'écran pendant la recette.
--
-- Cas particuliers couverts en plus de la matrice :
--   - points_override (p5 = 4 pts, p17 = 5 pts) qui écrase le barème difficulté
--   - help_animator (p5, p7, p17)
--   - les 3 difficultés (Facile 1 pt / Moyen 2 / Difficile 3)
--   - paliers d'estimation larges (p6), serrés (p9) et tout-ou-rien (p11)
--
-- Les URLs de media pointent toutes vers des fichiers qui EXISTENT déjà dans
-- le storage / sur YouTube (réutilisés depuis des questions en production) :
-- un media inventé donnerait un lecteur vide et invaliderait la recette.
--
-- `published = false` : le quiz reste lançable depuis le back-office
-- (QuizLivePage lit /api/quizzes, non filtré) mais ne fuite pas sur les
-- routes publiques, qui filtrent sur published.
--
-- Idempotente : rejouable, elle supprime d'abord le quiz "test" précédent.

BEGIN;

-- Nettoyage d'une exécution antérieure (les questions orphelines partent avec)
DELETE FROM questions
WHERE id IN (
  SELECT qq.question_id FROM quiz_questions qq
  JOIN quizzes z ON z.id = qq.quiz_id
  WHERE z.name = 'test'
);
DELETE FROM quizzes WHERE name = 'test';

WITH new_quiz AS (
  INSERT INTO quizzes (
    name, theme, published, do_not_delete,
    pause_promotional_text, end_winner_text, end_text_final
  ) VALUES (
    'test',
    'Recette technique',
    false,
    false,
    'Quiz de recette : on vérifie l''affichage de chaque type de question.',
    'Félicitations à <span class="text-green">#winner#</span> qui valide la recette !',
    'Fin du quiz de recette<br><br>Tous les <span class="text-green">types de questions</span> ont été joués.'
  ) RETURNING id
),
src (
  pos, question, type, difficulty, answers, correct_answer_index, theme,
  help_animator, music_url, video_youtube, image_question_url, image_answer_url,
  expected_answer, expected_number, estimation_scoring, points_override
) AS (
  VALUES
  -- ============================== QCM ==============================
  (0,
   'Quelle est la capitale de l''Australie ?',
   'qcm', ARRAY['Facile'], ARRAY['Canberra','Sydney','Melbourne','Perth'], 0,
   'QCM · sans média',
   NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
   NULL::text, NULL::numeric, NULL::jsonb, NULL::int),

  (1,
   'De quel long métrage Disney cette image est-elle tirée ?',
   'qcm', ARRAY['Facile'], ARRAY['Alice au pays des merveilles','Peter Pan','Fantasia','Cendrillon'], 0,
   'QCM · image avant',
   NULL, NULL, NULL,
   'https://ekplxvihchsxnhtjgfzi.supabase.co/storage/v1/object/public/invader-assets/images/a1c716c4-ff28-4c98-8e5a-ab45db126b88.webp',
   NULL, NULL, NULL, NULL, NULL),

  (2,
   'Avec quelle chanteuse David Guetta signe-t-il le tube « I''m Good (Blue) » ?',
   'qcm', ARRAY['Moyen'], ARRAY['Bebe Rexha','Anne-Marie','Sia','Dua Lipa'], 0,
   'QCM · image après',
   NULL, NULL, NULL, NULL,
   'https://ekplxvihchsxnhtjgfzi.supabase.co/storage/v1/object/public/invader-assets/images/812f446f-6ae9-416d-8bbc-00294aff225f.jpg',
   NULL, NULL, NULL, NULL),

  (3,
   'Quel grand classique Disney de 1942 cette image illustre-t-elle ?',
   'qcm', ARRAY['Facile'], ARRAY['Bambi','Dumbo','Pinocchio','Le Livre de la jungle'], 0,
   'QCM · images avant et après',
   NULL, NULL, NULL,
   'https://ekplxvihchsxnhtjgfzi.supabase.co/storage/v1/object/public/invader-assets/images/8d62ffd5-4a15-4ca5-8ae8-1b0eb9ce9ffe.webp',
   'https://ekplxvihchsxnhtjgfzi.supabase.co/storage/v1/object/public/invader-assets/images/5e2969e7-7947-4fa0-8ac9-59c88145fea7.webp',
   NULL, NULL, NULL, NULL),

  (4,
   'Qui accompagne Rosé sur le titre « APT » ?',
   'qcm', ARRAY['Moyen'], ARRAY['Bruno Mars','The Weeknd','Post Malone','Charlie Puth'], 0,
   'QCM · audio',
   NULL,
   'https://ekplxvihchsxnhtjgfzi.supabase.co/storage/v1/object/public/invader-assets/audio/de84f2a2-c514-4788-8c12-254b5d284f32.mp3',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL),

  (5,
   'Comment s''appelle le vol qui s''écrase au début de la série « Lost » ?',
   'qcm', ARRAY['Difficile'], ARRAY['Vol 815 Oceanic','Vol 316 Ajira','Vol 23 Pan Am','Vol 447 Oceanic'], 0,
   'QCM · vidéo (points forcés)',
   'Le vol Oceanic 815 reliait Sydney à Los Angeles. Barème forcé à 4 points sur cette question.',
   NULL, 'hoHUIN0bX-c?time=0&duration=11', NULL, NULL,
   NULL, NULL, NULL, 4),

  -- =========================== ESTIMATION ===========================
  (6,
   'Combien de touches compte un piano classique ?',
   'estimation', ARRAY['Moyen'], ARRAY[]::text[], 0,
   'Estimation · sans média',
   NULL, NULL, NULL, NULL, NULL,
   NULL, 88,
   '[{"maxGap":0,"points":3},{"maxGap":2,"points":2},{"maxGap":6,"points":1}]'::jsonb,
   NULL),

  (7,
   'Combien de prix internationaux ce guitariste a-t-il remportés ?',
   'estimation', ARRAY['Difficile'], ARRAY[]::text[], 0,
   'Estimation · image avant',
   'Thibault Cauvin, guitariste classique français.',
   NULL, NULL,
   'https://ekplxvihchsxnhtjgfzi.supabase.co/storage/v1/object/public/invader-assets/images/4e9f09a7-80fd-4d5d-bd3a-a72ea7de4a31.jpg',
   NULL, NULL, 36,
   '[{"maxGap":0,"points":5},{"maxGap":3,"points":3},{"maxGap":10,"points":1}]'::jsonb,
   NULL),

  (8,
   'Combien de millions de vues ce clip totalise-t-il sur YouTube ?',
   'estimation', ARRAY['Difficile'], ARRAY[]::text[], 0,
   'Estimation · image après',
   NULL, NULL, NULL, NULL,
   'https://ekplxvihchsxnhtjgfzi.supabase.co/storage/v1/object/public/invader-assets/images/47adea46-bb1d-4cb2-8a96-d3f4bdefa44f.jpg',
   NULL, 51,
   '[{"maxGap":0,"points":5},{"maxGap":5,"points":3},{"maxGap":15,"points":1}]'::jsonb,
   NULL),

  (9,
   'Avec combien de cordes ce guitariste brésilien joue-t-il ?',
   'estimation', ARRAY['Difficile'], ARRAY[]::text[], 0,
   'Estimation · images avant et après',
   NULL, NULL, NULL,
   'https://ekplxvihchsxnhtjgfzi.supabase.co/storage/v1/object/public/invader-assets/images/ab7ad814-b828-4310-ba46-0c0b055de32f.jpg',
   'https://ekplxvihchsxnhtjgfzi.supabase.co/storage/v1/object/public/invader-assets/images/4c0eb48d-b333-43ba-8c5a-9bda67089c45.jpg',
   NULL, 7,
   '[{"maxGap":0,"points":4},{"maxGap":1,"points":2}]'::jsonb,
   NULL),

  (10,
   'En quelle année ce titre de Sean Paul est-il sorti ?',
   'estimation', ARRAY['Difficile'], ARRAY[]::text[], 0,
   'Estimation · audio',
   NULL,
   'https://ekplxvihchsxnhtjgfzi.supabase.co/storage/v1/object/public/invader-assets/audio/9791a0d0-338b-4fe7-856b-16c354c24019.mp3',
   NULL, NULL, NULL,
   NULL, 2005,
   '[{"maxGap":0,"points":3},{"maxGap":2,"points":2},{"maxGap":5,"points":1}]'::jsonb,
   NULL),

  (11,
   'En quelle année « Final Fantasy X » est-il sorti au Japon ?',
   'estimation', ARRAY['Difficile'], ARRAY[]::text[], 0,
   'Estimation · vidéo',
   NULL, NULL, 'riNzVUJumM8?time=10&duration=20', NULL, NULL,
   NULL, 2001,
   '[{"maxGap":0,"points":5}]'::jsonb,
   NULL),

  -- =========================== REPONSE LIBRE ===========================
  (12,
   'Comment s''appelle le majordome de Batman ?',
   'free_text', ARRAY['Facile'], ARRAY[]::text[], 0,
   'Réponse libre · sans média',
   NULL, NULL, NULL, NULL, NULL,
   'Alfred', NULL, NULL, NULL),

  (13,
   'De quel film d''animation Disney ce personnage est-il issu ?',
   'free_text', ARRAY['Difficile'], ARRAY[]::text[], 0,
   'Réponse libre · image avant',
   NULL, NULL, NULL,
   'https://ekplxvihchsxnhtjgfzi.supabase.co/storage/v1/object/public/invader-assets/images/ff48bf1c-dc7b-48fc-8208-969ea859a922.jpg',
   NULL,
   'Bienvenue chez les Robinsons', NULL, NULL, NULL),

  (14,
   'Quelle cantaora andalouse a remporté en 2020 une Victoire de la musique ?',
   'free_text', ARRAY['Difficile'], ARRAY[]::text[], 0,
   'Réponse libre · image après',
   NULL, NULL, NULL, NULL,
   'https://ekplxvihchsxnhtjgfzi.supabase.co/storage/v1/object/public/invader-assets/images/a2f3526e-0bd9-49a8-a322-7642a45ab7c4.jpg',
   'Rocío Márquez', NULL, NULL, NULL),

  (15,
   'Comment s''appelle cette chanteuse béninoise, cinq fois lauréate d''un Grammy Award ?',
   'free_text', ARRAY['Difficile'], ARRAY[]::text[], 0,
   'Réponse libre · images avant et après',
   NULL, NULL, NULL,
   'https://ekplxvihchsxnhtjgfzi.supabase.co/storage/v1/object/public/invader-assets/images/48be4562-4241-4401-a736-ebc7082e5ea7.jpg',
   'https://ekplxvihchsxnhtjgfzi.supabase.co/storage/v1/object/public/invader-assets/images/4478c339-23d8-4c98-8e1a-f2dede7ebfdf.jpg',
   'Angélique Kidjo', NULL, NULL, NULL),

  (16,
   'Quel est le titre de cette chanson d''Aya Nakamura ?',
   'free_text', ARRAY['Moyen'], ARRAY[]::text[], 0,
   'Réponse libre · audio',
   NULL,
   'https://ekplxvihchsxnhtjgfzi.supabase.co/storage/v1/object/public/invader-assets/audio/1b464c38-6260-42c6-9670-3370cc96a5d9.mp3',
   NULL, NULL, NULL,
   'Copines', NULL, NULL, NULL),

  (17,
   'De quelle saga de films ce générique est-il issu ?',
   'free_text', ARRAY['Facile'], ARRAY[]::text[], 0,
   'Réponse libre · vidéo (points forcés)',
   'Saga lancée en 2003 avec « La Malédiction du Black Pearl ». Barème forcé à 5 points.',
   NULL, 'dlXSJ83T9Lg?time=0&duration=31', NULL, NULL,
   'Pirates des Caraïbes', NULL, NULL, 5)
),
ins AS (
  INSERT INTO questions (
    question, type, difficulty, answers, correct_answer_index, theme,
    help_animator, music_url, video_youtube, image_question_url, image_answer_url,
    expected_answer, expected_number, estimation_scoring, points_override
  )
  SELECT
    question, type, difficulty, answers, correct_answer_index, theme,
    help_animator, music_url, video_youtube, image_question_url, image_answer_url,
    expected_answer, expected_number, estimation_scoring, points_override
  FROM src ORDER BY pos
  RETURNING id, theme
)
-- On relie par `theme` : il est unique par question dans ce quiz (un thème =
-- un cas de la matrice), contrairement au texte qui pourrait se répéter.
INSERT INTO quiz_questions (quiz_id, question_id, position)
SELECT (SELECT id FROM new_quiz), ins.id, src.pos
FROM ins JOIN src ON src.theme = ins.theme;

COMMIT;
