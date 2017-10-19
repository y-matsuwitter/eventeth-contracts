pragma solidity ^0.4.15;

/* Eventeth is a contract to manage event registration and auctions.
 * TODO:
 *  - cancellation from Eventeth owner.
 *  - cancellation from EventethController owner.
 */
contract Eventeth {
  address public organizer;
  address public owner; // owner of EventethConroller
  string public name;
  uint public registrationStarted;
  uint public registrationEnded;
  uint public minimumGuarantee;
  uint public capacity;
  bool public canceled = false;

  uint private constant OWNER_FEE = 100;
  uint private constant FEE_PRECISION = 10000;

  struct Candidate {
    address registerer;
    string name;
    uint fee;
  }

  event Canceled(address _eventAddress, string _name);
  event Registered(address _registerer, string _name);
  event Deregistered(address _registerer, string _name);
  event RequestedDelegation(address _registerer, string _name, uint _fee);
  event CancelDelegation(address _registerer, string _name, uint _fee);
  event AcquiredDelegation(address _registerer, string _name, uint _fee);
  event RegistererApproved(address[] _registerers);

  /* TODO: make these to private */
  Candidate[] public candidates;
  address[] public invitations;
  mapping (address => Candidate) public approved;
  mapping (address => uint) public refunds;
  mapping (address => Candidate) public delegations;

  modifier duringRegistrationPeriod() {
    require(now > registrationStarted);
    require(now <= registrationEnded);
    _;
  }

  modifier afterRegistrationEnd() {
    require(now > registrationEnded);
    _;
  }

  modifier beforeRegistrationEnd() {
    require(now <= registrationEnded);
    _;
  }

  modifier notCanceled() {
    require(!canceled);
    _;
  }

  modifier onlyOrganizer() {
    require(organizer == msg.sender);
    _;
  }

  modifier onlyAdministrator() {
    require(organizer == msg.sender || owner == msg.sender);
    _;
  }

  function Eventeth(address _organizer, string _name, uint _registrationStarted, uint _registrationEnded,
     uint _minimumGuarantee, uint _capacity, address _owner)
    public payable
  {
    organizer = _organizer;
    owner = _owner;
    name = _name;
    registrationStarted = _registrationStarted;
    registrationEnded = _registrationEnded;
    minimumGuarantee = _minimumGuarantee;
    capacity = _capacity;
  }

  function register(string _name)
    public
    payable
    duringRegistrationPeriod()
    notCanceled()
  {
    require(msg.value >= minimumGuarantee);

    var c = getCandidate(msg.sender);
    /*if (c.registerer == msg.sender) {
      refunds[msg.sender] += c.fee;
    }*/

    addCandidate(msg.sender, _name, msg.value);
    Registered(msg.sender, _name);
    if (c.registerer == msg.sender) {
      msg.sender.transfer(c.fee);
    }
  }

  function deregister()
    public
    duringRegistrationPeriod()
    notCanceled()
    returns (bool success)
  {
    var c = getCandidate(msg.sender);
    if (c.registerer == msg.sender) {
      removeCandidate(msg.sender);
      uint refund = refunds[msg.sender] + c.fee;
      msg.sender.transfer(refund);
      refunds[msg.sender] = 0;
      Deregistered(msg.sender, c.name);
      success = true;
    }else{
      success = false;
    }
  }

  function checkRegistered()
    public
    duringRegistrationPeriod()
    notCanceled()
    constant
    returns (bool success)
  {
    var c = getCandidate(msg.sender);
    success = c.registerer == msg.sender;
  }

  function invitationByOwner(address[] registerers)
    public
    onlyOrganizer()
    notCanceled()
    returns (bool success)
  {
    for (uint i = 0; i < registerers.length ; i++ ) {
      var registerer = registerers[i];
      var c = getCandidate(registerer);
      require(c.registerer == registerer);
      invitations.push(registerer);
    }
    success = true;
  }

  function revealApproved()
    public
    onlyOrganizer()
    afterRegistrationEnd()
    notCanceled()
    returns (bool success)
  {
    uint amount;
    uint approvedCount = 0;
    uint i;

    var registerers = new address[](capacity);

    /* Approve prioritized registerers by an owner.*/
    for(i = 0; i < invitations.length && approvedCount <= capacity ; i++) {
      var c = getCandidate(invitations[i]);
      if (c.registerer != 0x0 && approved[c.registerer].registerer == 0x0) {
        approved[c.registerer] = c;
        amount += c.fee;
        registerers[approvedCount] = c.registerer;
        approvedCount++;
      }
    }
    /* Sort left candidates by each fee.*/
    Candidate[] memory tmp = sortedCandidates();

    /* Fetch approve candidates until capacity < approved.length*/
    for(i = 0; i < tmp.length ; i++) {
      var _c = tmp[i];

      /* Add candidates to refunds if this event is full.*/
      if (_c.registerer != 0x0 && approvedCount == capacity) {
        refunds[_c.registerer] += _c.fee;
      }

      if (_c.registerer != 0x0 && approved[_c.registerer].registerer == 0x0 && approvedCount < capacity) {
        approved[_c.registerer] = _c;
        amount += _c.fee;
        registerers[approvedCount] = _c.registerer;
        approvedCount++;
      }
    }

    /* Send registerers fee to organizer.*/
    uint ownerFee = amount * OWNER_FEE / FEE_PRECISION;
    organizer.transfer(amount - ownerFee);
    owner.transfer(ownerFee);

    RegistererApproved(registerers);
    success = true;
  }

  function cancelEvent()
    public
    onlyAdministrator()
    notCanceled()
    beforeRegistrationEnd()
  {
    canceled = true;
    Canceled(address(this), name);
    for(uint i = 0; i < candidates.length ; i++){
      var c = candidates[i];
      if (c.registerer != 0x0) {
        refunds[c.registerer] = c.fee;
      }
    }
  }

  function registrationApproved()
    public
    afterRegistrationEnd()
    notCanceled()
    constant returns (bool success)
  {
    var c = approved[msg.sender];
    success = c.registerer == msg.sender;
  }

  function checkRefund()
    public
    constant returns (uint)
  {
    return refunds[msg.sender];
  }

  function withdrawalRefund()
    public
    returns (bool success)
  {
    require(now > registrationEnded || canceled);
    uint refund = refunds[msg.sender];
    if (refund > 0) {
      refunds[msg.sender] = 0;
      msg.sender.transfer(refund);
      success = true;
    } else {
      success = false;
    }
  }

  function requestRegistrationTransfer()
    public
    notCanceled()
    afterRegistrationEnd()
  {
    var c = approved[msg.sender];
    require(c.registerer == msg.sender);

    var _c = Candidate(msg.sender, c.name, c.fee);
    delegations[msg.sender] = _c;
    delete approved[msg.sender];
    RequestedDelegation(_c.registerer, _c.name, _c.fee);
  }

  function cancelRegistrationTransfer()
    public
    notCanceled()
    afterRegistrationEnd()
  {
    var c = delegations[msg.sender];
    require(c.registerer == msg.sender);

    var _c = Candidate(msg.sender, c.name, c.fee);
    approved[msg.sender] = _c;
    delete delegations[msg.sender];
    CancelDelegation(_c.registerer, _c.name, _c.fee);
  }

  function checkRegistrationTransferring()
    public
    notCanceled()
    afterRegistrationEnd()
    constant
    returns (bool success)
  {
    var c = delegations[msg.sender];
    success = c.registerer == msg.sender;
  }

  function acquireRegistrationTransfer(address _from, string _name)
    public
    payable
    notCanceled()
    afterRegistrationEnd()
  {
    var c = delegations[_from];

    require(c.registerer == _from && (c.fee == 0 || msg.value >= c.fee));

    var delegation = Candidate(msg.sender, _name, c.fee);
    delete delegations[_from];
    approved[msg.sender] = delegation;
    AcquiredDelegation(msg.sender, _name, c.fee);
    uint ownerFee = msg.value * OWNER_FEE / FEE_PRECISION;
    _from.transfer(msg.value - ownerFee);
    owner.transfer(ownerFee);
  }

  /*****************************/
  /***** PRIVATE FUNCTIONS *****/
  /*****************************/
  function addCandidate(address _registerer, string _name, uint _fee) private {
    bool added = false;
    for (uint i = 0; i < candidates.length ; i++) {
      var c = candidates[i];
      if (c.registerer == _registerer) {
        candidates[i] = Candidate(_registerer, _name, _fee);
        added = true;
        break;
      }
    }
    if (!added) {
      candidates.push(Candidate(_registerer, _name, _fee));
    }
  }

  function removeCandidate(address _registerer)
    private
    returns (bool success)
  {
    success = false;
    for (uint i = 0; i < candidates.length ; i++) {
      var c = candidates[i];
      if (c.registerer == _registerer) {
        delete candidates[i];
        success = true;
      }
    }
  }

  function getCandidate(address _registerer)
    private
    constant
    returns (Candidate c)
  {
    for (uint i = 0; i < candidates.length ; i++) {
      var _c = candidates[i];
      if (_c.registerer == _registerer) {
        c = _c;
        break;
      }
    }
  }

  function sortedCandidates()
    private
    constant
    returns (Candidate[] sorted)
  {
    uint len = candidates.length;
    uint i = 0;
    uint j = 0;

    sorted = new Candidate[](len);

    for(i = 0; i < len; i++) {
      sorted[i] = candidates[i];
    }

    for(i = 1; i < sorted.length; i++ ) {
      var c = sorted[i];

      for(j = i; j > 0 && sorted[j-1].fee < c.fee; j-- ) {
        sorted[j] = sorted[j-1];
      }

      sorted[j] = c;
    }
  }
}
