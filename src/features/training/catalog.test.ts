import test from 'node:test';
import assert from 'node:assert/strict';
import { exerciseCatalog, searchExercises } from './catalog';
import { exercisesSchema, newTrainingSet, templateExercises, templateSchema } from './model';
test('150项统一目录具有唯一标识、名称和完整检索维度', () => {
  assert.equal(exerciseCatalog.length, 150); assert.equal(new Set(exerciseCatalog.map(e => e.id)).size, 150); assert.equal(new Set(exerciseCatalog.map(e => e.name)).size, 150);
  for (const e of exerciseCatalog) { assert.match(e.id, /^[a-z0-9-]+$/); assert.ok(e.english && e.bodyParts.length && e.equipment && e.pattern && e.source.startsWith('https://')); }
  assert.equal(searchExercises('RDL')[0].name, '罗马尼亚硬拉'); assert.ok(searchExercises('bench').some(e => e.name === '杠铃卧推')); assert.ok(searchExercises('平板支撑').every(e => e.recordingType === 'duration'));
  assert.equal(searchExercises('', 'cardio').length, 20); assert.equal(searchExercises('', 'mobility').length, 30); assert.ok(searchExercises('', 'strength', '胸', '哑铃').length); assert.equal(searchExercises('不存在的虚构动作').length, 0);
});
test('三种记录各按自身字段完成，未知和0有别，不用时长替代次数', () => {
  const row = (recordingType: 'reps'|'duration'|'cardio', values: object) => [{ id: crypto.randomUUID(), name: '虚构动作', recordingType, sets: [{ ...newTrainingSet(), completed: true, ...values }] }];
  assert.ok(exercisesSchema.safeParse(row('reps', { reps: 10, weightKg: 0 })).success);
  assert.ok(exercisesSchema.safeParse(row('duration', { durationSeconds: 30 })).success);
  assert.ok(exercisesSchema.safeParse(row('cardio', { distanceMeters: 1000 })).success);
  assert.ok(exercisesSchema.safeParse(row('cardio', { durationSeconds: 600 })).success); assert.ok(exercisesSchema.safeParse(row('cardio', { durationSeconds:60,distanceMeters:0 })).success);
  for (const values of [{ durationSeconds: 0 }, { durationSeconds: -1 }, { durationSeconds: 2.5 }, { durationSeconds: 86401 }]) assert.equal(exercisesSchema.safeParse(row('duration', values)).success, false);
  assert.equal(exercisesSchema.safeParse(row('reps', { durationSeconds: 30 })).success, false);
  assert.equal(exercisesSchema.safeParse(row('duration', { reps: 10 })).success, false);
  assert.equal(exercisesSchema.safeParse(row('cardio', { distanceMeters: 0 })).success, false);
  assert.equal(exercisesSchema.safeParse(row('cardio', { distanceMeters: -3 })).success, false);
});
test('模板目标生成独立快照，实际值保持未知，旧模板继续兼容', () => {
  const template = templateSchema.parse({ name: '虚构混合模板', exercises: [{ name: '平板支撑', catalogId: 'plank', recordingType: 'duration', sets: 2, reps: null, durationSeconds: 30 }, { name: '跑步机跑步', recordingType: 'cardio', sets: 1, reps: null, durationSeconds: 1200, distanceMeters: 3000 }, { name: '旧卧推', sets: 3, reps: 12 }] });
  const actual = templateExercises(template);
  assert.equal(actual[0].target?.durationSeconds, 30); assert.equal(actual[0].sets[0].durationSeconds, null); assert.equal(actual[0].sets[0].completed, false); assert.equal(actual[1].sets[0].distanceMeters, null); assert.equal(actual[2].sets.length, 3); assert.equal(actual[2].sets[0].reps, null); assert.ok(exercisesSchema.safeParse(actual).success);
  actual[0].target!.durationSeconds = 60; assert.equal(template.exercises[0].durationSeconds, 30);
});
