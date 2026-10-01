// The test characters (test/fixtures/README.md) read exactly as they were set up in the game.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { allItems, parsePlayerData, readPlayerFile, UnsupportedVersionError } from '../dist/index.js'

const load = async (name) => readPlayerFile(await readFile(new URL(`./fixtures/${name}`, import.meta.url)))
// the slot / id / stack / prefix of a list, for compact comparisons
const slots = (items) => items.map((i) => [i.slot, i.id, i.stack, i.prefix])

// item ids
const ID = {
  CopperPickaxe: 3509, CopperShortsword: 3507, CopperAxe: 3506, Torch: 8, DirtBlock: 2, Wood: 9,
  StoneBlock: 3, Gel: 23, SilverBar: 21, GoldCoin: 73, SilverCoin: 72, WoodenArrow: 40,
  WoodHelmet: 727, WoodBreastplate: 728, WoodGreaves: 729, FledglingWings: 4978, HermesBoots: 54,
  TreasureMagnet: 5010, Ox33Aviators: 3763, RedDye: 1007, ShadewoodHelmet: 924, EbonwoodHelmet: 730,
  Eyebone: 5098, ShadowOrb: 115, Minecart: 2343, SlimySaddle: 2430, GrapplingHook: 84,
}
const WILD = 77
const BRISK = 73

test('journey.plr: header and stats', async () => {
  const p = await load('journey.plr')
  assert.equal(p.version, 326)
  assert.equal(p.name, 'test_char_journey')
  assert.equal(p.difficulty, 'journey')
  assert.equal(p.maxLife, 140)
  assert.equal(p.maxMana, 40)
  assert.equal(p.upgrades.lifeCrystals, 2)
  assert.equal(p.upgrades.lifeFruit, 0)
  assert.equal(p.upgrades.manaCrystals, 1)
  assert.equal(p.upgrades.demonHeart, false)
})

test('journey.plr: inventory, coins, ammo', async () => {
  const p = await load('journey.plr')
  assert.deepEqual(slots(p.inventory), [
    [0, ID.CopperPickaxe, 1, 0],
    [9, ID.Torch, 37, 0],
    [49, ID.DirtBlock, 50, 0],
  ])
  assert.equal(p.inventory.find((i) => i.slot === 49).favorited, true)
  assert.equal(p.inventory.find((i) => i.slot === 0).favorited, false)
  assert.deepEqual(slots(p.coins), [
    [0, ID.GoldCoin, 3, 0],
    [1, ID.SilverCoin, 12, 0],
  ])
  assert.deepEqual(slots(p.ammo), [[0, ID.WoodenArrow, 123, 0]])
})

test('journey.plr: equipment, vanity, dyes', async () => {
  const { equipment } = await load('journey.plr')
  assert.deepEqual(slots(equipment.armor), [
    [0, ID.WoodHelmet, 1, 0],
    [1, ID.WoodBreastplate, 1, 0],
    [2, ID.WoodGreaves, 1, 0],
  ])
  assert.deepEqual(slots(equipment.accessories), [
    [0, ID.FledglingWings, 1, WILD],
    [1, ID.HermesBoots, 1, 0],
    [4, ID.TreasureMagnet, 1, BRISK],
  ])
  assert.deepEqual(slots(equipment.vanityArmor), [[0, ID.Ox33Aviators, 1, 0]])
  assert.deepEqual(equipment.vanityAccessories, [])
  assert.deepEqual(slots(equipment.dyes), [[0, ID.RedDye, 1, 0]])
})

test('journey.plr: misc equipment', async () => {
  const { misc } = await load('journey.plr')
  assert.equal(misc.pet.item.id, ID.Eyebone)
  assert.equal(misc.lightPet.item.id, ID.ShadowOrb)
  assert.equal(misc.minecart.item.id, ID.Minecart)
  assert.equal(misc.mount.item.id, ID.SlimySaddle)
  assert.equal(misc.hook.item.id, ID.GrapplingHook)
  for (const slot of Object.values(misc)) assert.equal(slot.dye, undefined)
})

test('journey.plr: loadouts (the active one is stored empty)', async () => {
  const { loadouts } = await load('journey.plr')
  assert.equal(loadouts.length, 3)
  assert.deepEqual(loadouts[0].armor, [])
  assert.deepEqual(slots(loadouts[1].armor), [[0, ID.ShadewoodHelmet, 1, 0]])
  assert.deepEqual(slots(loadouts[2].armor), [[0, ID.EbonwoodHelmet, 1, 0]])
})

test('journey.plr: storages (first and last slot)', async () => {
  const p = await load('journey.plr')
  assert.deepEqual(slots(p.piggyBank), [[0, ID.Wood, 1, 0], [39, ID.StoneBlock, 1, 0]])
  assert.deepEqual(slots(p.safe), [[0, ID.DirtBlock, 1, 0], [39, ID.Torch, 1, 0]])
  assert.deepEqual(slots(p.defendersForge), [[0, ID.Gel, 1, 0], [39, ID.SilverBar, 1, 0]])
  assert.deepEqual(slots(p.voidVault), [[0, ID.GoldCoin, 1, 0], [39, ID.SilverCoin, 1, 0]])
})

test('journey.plr: research', async () => {
  const { research } = await load('journey.plr')
  assert.equal(research.Wood, 30)
  assert.equal(research.CopperPickaxe, 1)
  assert.equal(research.DirtBlock, 100)
  assert.equal(Object.keys(research).length, 15)
})

test('journey.plr: the trash slot is not saved', async () => {
  const p = await load('journey.plr')
  // the only Gel is the one in the Defender's Forge
  assert.deepEqual(allItems(p).filter((i) => i.id === ID.Gel).map((i) => i.where), ['defendersForge'])
})

test('classic.plr', async () => {
  const p = await load('classic.plr')
  assert.equal(p.version, 326)
  assert.equal(p.name, 'test_char_classic')
  assert.equal(p.difficulty, 'classic')
  assert.equal(p.maxLife, 120)
  assert.equal(p.upgrades.lifeCrystals, 1)
  assert.equal(p.upgrades.manaCrystals, 0)
  // starting tools (random prefixes), Gel in hotbar slot 4, Stone in the last slot
  assert.deepEqual(
    p.inventory.map((i) => [i.slot, i.id, i.stack]),
    [
      [0, ID.CopperShortsword, 1],
      [1, ID.CopperPickaxe, 1],
      [2, ID.CopperAxe, 1],
      [3, ID.Gel, 6],
      [49, ID.StoneBlock, 6],
    ],
  )
  assert.deepEqual(p.research, {})
  assert.deepEqual([...p.piggyBank, ...p.safe, ...p.defendersForge, ...p.voidVault], [])
  assert.deepEqual(p.loadouts.map((l) => l.armor), [[], [], []])
})

test('allItems lists every place', async () => {
  const items = allItems(await load('journey.plr'))
  const where = new Set(items.map((i) => i.where))
  for (const w of ['inventory', 'coins', 'ammo', 'equipment', 'misc:pet', 'loadout:2', 'loadout:3', 'piggyBank', 'safe', 'defendersForge', 'voidVault'])
    assert.ok(where.has(w), w)
})

test('errors: not a player file, unsupported version', async () => {
  await assert.rejects(readPlayerFile(new Uint8Array(32)), /Not a Terraria player file/)
  const header = new Uint8Array(16)
  new DataView(header.buffer).setInt32(0, 279, true)
  header.set(new TextEncoder().encode('relogic'), 4)
  header[11] = 3
  assert.throws(() => parsePlayerData(header), UnsupportedVersionError)
})
