DELETE FROM look_recommendations WHERE diagnosis_id IN (SELECT id FROM diagnoses WHERE user_id='4a5346d1-ea95-4902-b802-27094f9b58ed');
DELETE FROM look_images WHERE diagnosis_id IN (SELECT id FROM diagnoses WHERE user_id='4a5346d1-ea95-4902-b802-27094f9b58ed');
DELETE FROM clothing_images WHERE diagnosis_id IN (SELECT id FROM diagnoses WHERE user_id='4a5346d1-ea95-4902-b802-27094f9b58ed');
DELETE FROM diagnoses WHERE user_id='4a5346d1-ea95-4902-b802-27094f9b58ed';