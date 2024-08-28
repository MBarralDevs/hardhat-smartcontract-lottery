const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const { assert, expect } = require("chai")
const { networkConfig, developmentChains } = require("../../helper-hardhat-config")
const { time, helpers } = require("@nomicfoundation/hardhat-network-helpers")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", async function () {
          let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval
          const chainId = network.config.chainId

          beforeEach(async function () {
              const { get } = deployments
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture(["all"])

              const raffleDeployment = await get("Raffle")
              const raffleAddress = raffleDeployment.address
              const vrfCoordinatorV2MockDeployment = await get("VRFCoordinatorV2Mock")
              const vrfCoordinatorV2Address = vrfCoordinatorV2MockDeployment.address

              raffle = await ethers.getContractAt("Raffle", raffleAddress)
              vrfCoordinatorV2Mock = await ethers.getContractAt(
                  "VRFCoordinatorV2Mock",
                  vrfCoordinatorV2Address,
              )
              raffleEntranceFee = await raffle.getEntranceFee()
              interval = await raffle.getInterval()
          })

          describe("constructor", async function () {
              it("Initializes the raffle correctly", async function () {
                  //Ideally we want to have just 1 assert per "it"
                  const raffleState = await raffle.getRaffleState()
                  assert.equal(raffleState.toString(), "0")
                  assert.equal(interval.toString(), networkConfig[chainId]["keepersUpdateInterval"])
              })
          })

          describe("enterRaffle", function () {
              it("Revert if don't pay enought", async function () {
                  await expect(raffle.enterRaffle()).to.be.revertedWithCustomError(
                      raffle,
                      "Raffle__NotEnoughETHEntered",
                  )
              })

              it("Records player when they enter", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  const playerFromContract = await raffle.getPlayer(0)
                  assert.equal(deployer, playerFromContract)
              })

              it("Emit event on enter", async function () {
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                      raffle,
                      "RaffleEnter",
                  )
              })

              it("Doesn't allow entrance when raffle is CALCULATING", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  //await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  //await network.provider.send("evm_mine", [])
                  //We pretend to be a chainlink keeper
                  await time.increase(Number(interval) + 1)
                  await raffle.performUpkeep("0x")
                  await expect(
                      raffle.enterRaffle({ value: raffleEntranceFee }),
                  ).to.be.revertedWithCustomError(raffle, "Raffle__NotOpen")
              })
          })

          describe("checkUpkeep", async function () {
              it("Returns false if people haven't send any ETH", async function () {
                  await time.increase(Number(interval) + 1)
                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x")
                  assert(!upkeepNeeded)
              })

              it("Returns false if raffle is CALCULATING", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await time.increase(Number(interval) + 1)
                  await raffle.performUpkeep("0x")
                  const raffleState = await raffle.getRaffleState()
                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x")
                  assert.equal(raffleState.toString(), "1")
                  assert(!upkeepNeeded)
              })
          })
      })
