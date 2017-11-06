const EV = artifacts.require("./Eventeth.sol");
const EVC = artifacts.require("./EventethController");

// specify time to increment by seconds
const timeTravel = function (time) {
  return new Promise((resolve, reject) => {
    web3.currentProvider.sendAsync({
      jsonrpc: "2.0",
      method: "evm_increaseTime",
      params: [time],
      id: new Date().getTime()
    }, (err, result) => {
      if(err){ return reject(err) }
      return resolve(result)
    });
  })
}

// Workaround for https://github.com/ethereumjs/testrpc/issues/336
const mineBlock = function () {
  return new Promise((resolve, reject) => {
    web3.currentProvider.sendAsync({
      jsonrpc: "2.0",
      method: "evm_mine"
    }, (err, result) => {
      if(err){ return reject(err) }
      return resolve(result)
    });
  })
}

contract('Eventeth', function(accounts) {
  const registrationPeriod = 2*24*60*60;
  const owner = accounts[1];
  const organizer = accounts[0];
  const EVENT_INIT_PARAMS = {
    _organizer: organizer,
    _name: "test",
    _registrationStarted: Math.floor(new Date().getTime()/1000) - registrationPeriod/2,
    _registrationEnded: Math.floor(new Date().getTime()/1000) + registrationPeriod/2,
    _minimumGuarantee: web3.toWei("0.01", "ether"),
    _capacity: 2,
    _owner: owner
  }

  const account1 = accounts[2];
  const account2 = accounts[3];
  const account3 = accounts[4];

  let event;

  beforeEach(async function(){
    const nowTime = web3.eth.getBlock(web3.eth.blockNumber).timestamp

    event = await EV.new(
      EVENT_INIT_PARAMS._organizer,
      EVENT_INIT_PARAMS._name,
      nowTime - registrationPeriod/2,
      nowTime + registrationPeriod/2,
      EVENT_INIT_PARAMS._minimumGuarantee,
      EVENT_INIT_PARAMS._capacity,
      EVENT_INIT_PARAMS._owner,
      {});
  })

  it("should have constructor value", async function() {
    assert(await event.organizer(), EVENT_INIT_PARAMS._organizer);
    assert(await event.name(), EVENT_INIT_PARAMS._name);
    assert(await event.minimumGuarantee(), EVENT_INIT_PARAMS._minimumGuarantee);
    assert(await event.capacity(), EVENT_INIT_PARAMS._capacity);
    assert(await event.owner(), EVENT_INIT_PARAMS._owner);
  })

  it("should enable users to register event.", async function() {
    const origin = web3.eth.getBalance(account1).toNumber()
    assert.equal(await event.checkRegistered.call({from: account1}), false)
    await event.register("test", {from: account1, value: web3.toWei("0.01", "ether")})
    assert.equal(await event.checkRegistered.call({from: account1}), true)
    assert.isBelow(web3.eth.getBalance(account1).toNumber(), origin - web3.toWei(0.01, "ether"))
    assert.equal(web3.eth.getBalance(event.address).toNumber(), web3.toWei(0.01, "ether"))

    await timeTravel(registrationPeriod/2 + 1)
    await event.revealApproved()
    assert.typeOf(
      await event.register("test", {from: account2, value: web3.toWei("0.1", "ether")}).catch(function(e){return e;}),
      "error", "error should thrown if an user try to register after registrationEnded.")
  })

  it("should return old registration fee if the user registered multiple times", async function(){
    await event.register("test", {from: account1, value: web3.toWei("0.01", "ether")})
    const afterRegistration = web3.eth.getBalance(account1).toNumber()

    await event.register("test", {from: account1, value: web3.toWei("0.1", "ether")})

    assert.equal(await event.checkRegistered.call({from: account1}), true)
    assert.isAbove(web3.eth.getBalance(account1).toNumber(), afterRegistration - web3.toWei(0.1, "ether"))
    assert.isBelow(web3.eth.getBalance(account1).toNumber(), afterRegistration + web3.toWei(0.01, "ether"))
    assert.equal(web3.eth.getBalance(event.address).toNumber(), web3.toWei(0.1, "ether"))
  })

  it("should enable users to de-register event.", async function() {
    await event.register("test", {from: account1, value: web3.toWei("0.01", "ether")})
    assert.equal(await event.checkRegistered.call({from: account1}), true)

    const origin = web3.eth.getBalance(account1).toNumber()
    await event.deregister({from: account1})
    assert.equal(await event.checkRegistered.call({from: account1}), false)
    assert.isAbove(web3.eth.getBalance(account1).toNumber(), origin)
    assert.isBelow(web3.eth.getBalance(account1).toNumber(), origin + 1.0 * web3.toWei("0.01", "ether"))
  });

  it("should return refund value.", async function(){
    assert.equal(await event.checkRefund().then(function(i){ return i.toNumber()}), 0)
    await event.register("test1", {from: account1, value: web3.toWei("0.01", "ether")})
    await event.register("test2", {from: account2, value: web3.toWei("0.02", "ether")})
    await event.register("test3", {from: account3, value: web3.toWei("0.03", "ether")})

    await timeTravel(registrationPeriod/2 + 1)
    await event.revealApproved()

    assert.equal((await event.checkRefund({from: account1})).toNumber(), web3.toWei(0.01, "ether"))
    assert.equal((await event.checkRefund({from: account2})).toNumber(), 0)
    assert.equal((await event.checkRefund({from: account3})).toNumber(), 0)

    const origin = web3.eth.getBalance(account1).toNumber()
    await event.withdrawalRefund({from: account1})
    assert.equal((await event.checkRefund({from: account1})).toNumber(), 0)
    assert.isAbove(web3.eth.getBalance(account1).toNumber(), origin)
    assert.isBelow(web3.eth.getBalance(account1).toNumber(), origin + web3.toWei(0.01, "ether"))
  })

  it("should approve registrant.", async function(){
    await event.register("test1", {from: account1, value: web3.toWei("0.01", "ether")})
    await event.register("test2", {from: account2, value: web3.toWei("0.02", "ether")})
    await event.register("test3", {from: account3, value: web3.toWei("0.03", "ether")})

    assert.typeOf(
      await event.revealApproved().catch(function(e){return e;}),
      "error", "error should thrown if called before the registrationEnded.")

    const origin = web3.eth.getBalance(organizer).toNumber()
    const originOwner = web3.eth.getBalance(owner).toNumber()

    await timeTravel(registrationPeriod/2 + 1)
    await event.revealApproved()

    assert.equal(await event.registrationApproved.call({from: account1}), false)
    assert.equal(await event.registrationApproved.call({from: account2}), true)
    assert.equal(await event.registrationApproved.call({from: account3}), true)

    assert.isAbove(web3.eth.getBalance(organizer).toNumber(), origin)
    assert.isAtMost(web3.eth.getBalance(organizer).toNumber(), origin + 1.0 * web3.toWei(0.05 * 0.99, "ether"))
    assert.equal(web3.eth.getBalance(owner).toNumber(), originOwner + 1.0 * web3.toWei(0.05 * 0.01, "ether"))
  })

  it("should approve invited users registration by owner", async function() {
    await event.register("test1", {from: account1, value: web3.toWei("0.01", "ether")})
    await event.register("test2", {from: account2, value: web3.toWei("0.02", "ether")})
    await event.register("test3", {from: account3, value: web3.toWei("0.03", "ether")})
    await event.invitationByOwner([account1])

    await timeTravel(registrationPeriod/2 + 1)
    await event.revealApproved()

    assert.equal(await event.registrationApproved.call({from: account1}), true)
    assert.equal(await event.registrationApproved.call({from: account2}), false)
    assert.equal(await event.registrationApproved.call({from: account3}), true)
  });

  it("should delegate approved registration.", async function(){
    // registration and approval
    await event.register("test1", {from: account1, value: web3.toWei("0.01", "ether")})
    await event.register("test2", {from: account2, value: web3.toWei("0.02", "ether")})
    await timeTravel(registrationPeriod/2 + 1)
    await event.revealApproved()
    assert.equal(await event.registrationApproved.call({from: account1}), true)

    await event.requestRegistrationTransfer({from: account1})
    assert.isFalse(await event.registrationApproved.call({from: account1}))
    assert.isFalse(await event.registrationApproved.call({from: account3}))
    assert.isTrue(await event.checkRegistrationTransferring.call({from: account1}))

    const origin = web3.eth.getBalance(account1).toNumber()
    const originOwner = web3.eth.getBalance(owner).toNumber()
    await event.acquireRegistrationTransfer(account1, "test1", {from: account3, value: web3.toWei("0.01", "ether")})
    assert.isFalse(await event.registrationApproved.call({from: account1}))
    assert.isTrue(await event.registrationApproved.call({from: account3}))
    assert.isFalse(await event.checkRegistrationTransferring.call({from: account1}))

    assert.isAbove(web3.eth.getBalance(account1).toNumber(), origin)
    assert.isAtMost(web3.eth.getBalance(account1).toNumber(), origin + 1.0 * web3.toWei(0.01 * 0.99, "ether"))
    assert.equal(web3.eth.getBalance(owner).toNumber(), originOwner + 1.0 * web3.toWei(0.01 * 0.01, "ether"))

    assert.typeOf(
      await event.requestRegistrationTransfer({from: account1}).catch(function(e){return e;}),
      "error", "error should thrown")
    assert.typeOf(await event.acquireRegistrationTransfer(
      account1, "test1", {from: account3, value: web3.toWei("0.01", "ether")}
    ).catch(function(e){return e;}),
    "error", "error should thrown.")
  })

  it("should cancel registration delegation.", async function(){
    // registration and approval
    await event.register("test1", {from: account1, value: web3.toWei("0.01", "ether")})
    await event.register("test2", {from: account2, value: web3.toWei("0.02", "ether")})
    await timeTravel(registrationPeriod/2 + 1)
    await event.revealApproved()
    assert.equal(await event.registrationApproved.call({from: account1}), true)

    await event.requestRegistrationTransfer({from: account1})
    assert.isFalse(await event.registrationApproved.call({from: account1}))
    assert.isTrue(await event.checkRegistrationTransferring.call({from: account1}))

    await event.cancelRegistrationTransfer({from: account1})
    assert.isFalse(await event.checkRegistrationTransferring.call({from: account1}))
    assert.isTrue(await event.registrationApproved.call({from: account1}))

    assert.typeOf(
      await event.cancelRegistrationTransfer({from: account1}).catch(function(e){return e;}),
      "error", "error should thrown if cancel twice or more.")
  })

  it("should cancel event by organizer and stop any action except withdrawal.", async function(){
    await event.register("test1", {from: account1, value: web3.toWei("0.01", "ether")})
    await event.cancelEvent({from: organizer})
    assert.isTrue(await event.canceled())

    assert.typeOf(
      await event.register("test2", {from: account2, value: web3.toWei("0.02", "ether")}).catch(function(e){return e;}),
      "error", "error should thrown if cancel twice or more.")

    const origin = web3.eth.getBalance(account1).toNumber()
    assert.equal((await event.checkRefund({from: account1})).toNumber(), web3.toWei(0.01, "ether"))
    await event.withdrawalRefund({from: account1})
    assert.equal((await event.checkRefund({from: account1})).toNumber(), 0)
    assert.isAbove(web3.eth.getBalance(account1).toNumber(), origin)
    assert.isAtMost(web3.eth.getBalance(account1).toNumber(), origin + 1.0 * web3.toWei(0.01, "ether"))
  })
})
