package cn.suike.slides.android;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.IOException;
import static org.junit.Assert.*;

/** Runs the production parser on Android's actual regex implementation, offline. */
@RunWith(AndroidJUnit4.class)
public final class NativeCasAndroidRegexTest {
    @Test public void productionPublicKeyParserAcceptsExactJsonAndRejectsMalformed() throws Exception {
        String modulus=new String(new char[128]).replace('\0','d');
        String json="{\"modulus\":\""+modulus+"\",\"exponent\":\"10001\"}";
        assertArrayEquals(new String[]{modulus,"10001"}, NativeCasPreflight.parseKey(json));
        assertThrows(IOException.class,()->NativeCasPreflight.parseKey(json.substring(0,json.length()-1)));
        assertThrows(IOException.class,()->NativeCasPreflight.parseKey(json+"}"));
        assertThrows(IOException.class,()->NativeCasPreflight.parseKey(json.replace("modulus","exponent")));
    }
}
