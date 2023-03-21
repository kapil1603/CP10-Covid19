const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

const authenticationToken = async (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "kapilkumar", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

// a list of all states in the state table

const convertDbObjectToResponseObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

app.get("/states/", authenticationToken, async (request, response) => {
  const getPlayersQuery = `
    SELECT
      *
    FROM
      state
    ORDER BY state_id;`;
  const stateArray = await db.all(getPlayersQuery);
  response.send(
    stateArray.map((eachPlayer) => convertDbObjectToResponseObject(eachPlayer))
  );
});

//  state based on the state ID
app.get("/states/:stateId/", authenticationToken, async (request, response) => {
  const { stateId } = request.params;
  const getPlayerQuery = `
    SELECT
      *
    FROM
      state
    WHERE
      state_id = ${stateId};`;
  const myState = await db.get(getPlayerQuery);
  //   response.send(myState);
  response.send(convertDbObjectToResponseObject(myState));
});

// a district based on the district ID
const convertDbObjectToResponseObjectDistrict = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

app.get(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictIdQuery = `
    SELECT
      *
    FROM
      district
    WHERE
      district_id = ${districtId};`;
    const myDistrict = await db.get(getDistrictIdQuery);
    //   response.send(myState);
    response.send(convertDbObjectToResponseObjectDistrict(myDistrict));
  }
);

// register user
app.post("/users/", async (request, response) => {
  const { username, password } = request.body;
  const hashedPassword = bcrypt.hash(request.body.password, 10);
  const registerUser = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(registerUser);
  if (dbUser === undefined) {
    const createUser = `
        INSERT INTO 
          user (username,name,password,gender,location)
          VALUES
          (
          '${username}', 
          '${name}',
          '${hashedPassword}', 
          '${gender}',
          '${location}'
        )`;
    const dbResponse = await db.run(createUser);
    response.send("User Registered");
  } else {
    response.status = 400;
    response.send("User Already Exist");
  }
});

//login user
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserName = `SELECT * FROM user WHERE username = '${username}'`;
  console.log(selectUserName);
  const dbUser = await db.get(selectUserName);
  console.log(dbUser);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "kapilkumar");
      response.send({ jwtToken });
      //   response.status(200);
      //   response.send("Login User");
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// Create a district in the district table
app.post("/districts/", authenticationToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const postDistrictQuery = `
  INSERT INTO
    district (district_name, state_id, cases,cured,active,deaths)
  VALUES
    ('${districtName}', ${stateId}, ${cases},${cured},${active},${deaths});`;
  const player = await db.run(postDistrictQuery);
  response.send("District Successfully Added");
});

// Updates the details of a specific district
app.put(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const { districtId } = request.params;
    const updateDistrictQuery = `
  UPDATE
    district
  SET
    district_name = '${districtName}',
    state_id = ${stateId},
    cases = ${cases},
    cured = ${cured},
    active = ${active},
    deaths = ${deaths}
  WHERE
    district_id = ${districtId};`;

    await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

// Deletes a district
app.delete(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
  DELETE FROM
    district
  WHERE
    district_id = ${districtId};`;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

// the statistics of total cases, cured, active, deaths;
app.get(
  "/states/:stateId/stats/",
  authenticationToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStateStatsQuery = `
        SELECT SUM(cases),
                SUM(cured),
                SUM(active),
                SUM(deaths)
        FROM district
        WHERE state_id = ${stateId} `;
    const myStateStats = await db.get(getStateStatsQuery);
    //   console.log(myStateStats);

    response.send({
      totalCases: myStateStats["SUM(cases)"],
      totalCured: myStateStats["SUM(cured)"],
      totalActive: myStateStats["SUM(active)"],
      totalDeaths: myStateStats["SUM(deaths)"],
    });
  }
);

//an object containing the state name of a district based on the district ID
//explanation : Using districtId we will get the state_id , and then
//               using the state_id we will get the state_name .
app.get(
  "/districts/:districtId/details/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictIdQuery = `
        SELECT state_id FROM district
        WHERE district_id = ${districtId} `;
    const myDistrictId = await db.get(getDistrictIdQuery);
    console.log(myDistrictId);

    const getStateNameQuery = `
  SELECT state_name as stateName FROM state
  WHERE state_id = ${myDistrictId.state_id}`;
    const myStateName = await db.get(getStateNameQuery);
    //   console.log(myStateName);
    response.send(myStateName);
  }
);

module.exports = app;
