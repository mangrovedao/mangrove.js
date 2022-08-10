// Unit tests for EventUtils.ts
import { equal } from "assert";
import Big from "big.js";
import { BigNumber } from "ethers";
import { describe, it } from "mocha";
import MangroveUtils from "../../dist/nodejs/util/mangroveUtils";


describe("MangroveUtils unit tests suite", () => {
    describe( "fromUntis", () => {
        it("returns Big number, amount is number and nameOrDecimal is number", async function () {
        //Arrange
        const mangroveUtils = new MangroveUtils();

        //Act
        const result = mangroveUtils.fromUnits(123, 11);

        //Assert
        equal( result.eq( Big( 123 ).div( Big(10).pow(11) ) ), true )
        })

        it("returns Big number, amount is string and nameOrDecimal is number", async function () {
            //Arrange
            const mangroveUtils = new MangroveUtils();
    
            //Act
            const result = mangroveUtils.fromUnits("123", 11);
    
            //Assert
            equal( result.eq( Big( 123 ).div( Big(10).pow(11) ) ), true )
        })

        it("returns Big number, amount is BigNumber and nameOrDecimal is number", async function () {
            //Arrange
            const mangroveUtils = new MangroveUtils();
    
            //Act
            const result = mangroveUtils.fromUnits(BigNumber.from(123), 11);
    
            //Assert
            equal( result.eq( Big( 123 ).div( Big(10).pow(11) ) ), true )
        })

        it("returns Big number, amount is number and nameOrDecimal is string", async function () {
            //Arrange
            const mangroveUtils = new MangroveUtils();
    
            //Act
            const result = mangroveUtils.fromUnits(123, "DAI");
    
            //Assert
            equal( result.eq( Big( 123 ).div( Big(10).pow(18) ) ), true )
        })

    } )
} )