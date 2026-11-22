# Sokoban Solver

A push-optimal Sokoban solver that splits every level into its rooms and solves each room exactly with a breadth-first search over pushes.

![make.fun entry](https://make.fun/badge/sokoban-solver-01-run-20261121.svg)
![rank](https://make.fun/badge/sokoban-solver-01-run-20261121/Thai-ji/sokoban-solver-20261122/rank.svg)
![reward](https://make.fun/badge/sokoban-solver-01-run-20261121/Thai-ji/sokoban-solver-20261122/reward.svg)

Competition: https://make.fun/competitions/sokoban-solver-01-run-20261121

## How it works

- Read every level under `/input/<id>/level.txt`.
- Cut the player's hallway row out of the floor; each remaining connected part that holds boxes is a room.
- Solve each room with a BFS over push states (boxes plus the player's reachable region), pruning dead squares and frozen 2 x 2 blocks.
- Join the room solutions with plain walking, which costs no pushes, and write `/output/<id>/solution.txt`.

Run locally:

```sh
MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
```
