#import "Radar3DView.h"
#import <React/RCTBridge.h>

@interface Radar3DView() <GLKViewDelegate>
@property (nonatomic, strong) EAGLContext *context;
@property (nonatomic, assign) CGFloat rotationAngle;
@property (nonatomic, assign) CGFloat pulseScale;
@property (nonatomic, assign) CGFloat pulseDirection;
@property (nonatomic, assign) CFTimeInterval lastTime;
@property (nonatomic, assign) GLuint radarShaderProgram;
@property (nonatomic, assign) GLuint blipShaderProgram;
@property (nonatomic, assign) GLuint radarVertexArray;
@property (nonatomic, assign) GLuint radarVertexBuffer;
@property (nonatomic, assign) GLuint radarLineVertexArray;
@property (nonatomic, assign) GLuint radarLineVertexBuffer;
@property (nonatomic, assign) GLuint blipVertexArray;
@property (nonatomic, assign) GLuint blipVertexBuffer;
@property (nonatomic, assign) GLint mvpMatrixUniform;
@property (nonatomic, assign) GLint positionAttribute;
@property (nonatomic, assign) GLKMatrix4 projectionMatrix;
@property (nonatomic, assign) GLKMatrix4 viewMatrix;
@property (nonatomic, assign) GLKMatrix4 modelMatrix;
@property (nonatomic, assign) GLKMatrix4 mvpMatrix;
@end

@implementation Radar3DView

- (instancetype)initWithFrame:(CGRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        [self setupGL];
        [self setupBuffers];
        [self setupShaders];
        _rotationSpeed = 1.0f;
        _pulseEnabled = YES;
        _rotationAngle = 0.0f;
        _pulseScale = 1.0f;
        _pulseDirection = 1.0f;
    }
    return self;
}

- (void)setupGL {
    self.context = [[EAGLContext alloc] initWithAPI:kEAGLRenderingAPIOpenGLES2];
    self.context = self.context;
    self.delegate = self;
    
    // Set up projection matrix
    float aspect = CGRectGetWidth(self.bounds) / CGRectGetHeight(self.bounds);
    self.projectionMatrix = GLKMatrix4MakePerspective(GLKMathDegreesToRadians(45.0f), aspect, 0.1f, 10.0f);
    
    // Set up view matrix (camera)
    self.viewMatrix = GLKMatrix4MakeLookAt(0.0f, 1.5f, 1.0f,  // Camera position
                                          0.0f, 0.0f, 0.0f,  // Look at
                                          0.0f, 1.0f, 0.0f); // Up
}

- (void)setupBuffers {
    // Radar base vertices (circular base)
    GLfloat radarBaseVertices[362 * 3]; // Center + 360 points
    radarBaseVertices[0] = 0.0f; // X
    radarBaseVertices[1] = 0.0f; // Y
    radarBaseVertices[2] = 0.0f; // Z
    
    for (int i = 1; i <= 360; i++) {
        double angle = (i - 1) * M_PI / 180.0;
        radarBaseVertices[i * 3] = (GLfloat)(cos(angle) * 0.5f);     // X
        radarBaseVertices[i * 3 + 1] = 0.0f;                        // Y
        radarBaseVertices[i * 3 + 2] = (GLfloat)(sin(angle) * 0.5f); // Z
    }
    
    // Radar lines (rings)
    GLfloat radarLineVertices[4 * 360 * 3]; // 4 rings * 360 points
    
    for (int ring = 0; ring < 4; ring++) {
        float radius = 0.125f * (ring + 1);
        for (int i = 0; i < 360; i++) {
            double angle = i * M_PI / 180.0;
            int index = (ring * 360 + i) * 3;
            radarLineVertices[index] = (GLfloat)(cos(angle) * radius);     // X
            radarLineVertices[index + 1] = 0.0f;                         // Y
            radarLineVertices[index + 2] = (GLfloat)(sin(angle) * radius); // Z
        }
    }
    
    // Create and bind radar base VAO and VBO
    glGenVertexArraysOES(1, &_radarVertexArray);
    glBindVertexArrayOES(_radarVertexArray);
    
    glGenBuffers(1, &_radarVertexBuffer);
    glBindBuffer(GL_ARRAY_BUFFER, _radarVertexBuffer);
    glBufferData(GL_ARRAY_BUFFER, sizeof(radarBaseVertices), radarBaseVertices, GL_STATIC_DRAW);
    
    glEnableVertexAttribArray(GLKVertexAttribPosition);
    glVertexAttribPointer(GLKVertexAttribPosition, 3, GL_FLOAT, GL_FALSE, 0, 0);
    
    // Create and bind radar line VAO and VBO
    glGenVertexArraysOES(1, &_radarLineVertexArray);
    glBindVertexArrayOES(_radarLineVertexArray);
    
    glGenBuffers(1, &_radarLineVertexBuffer);
    glBindBuffer(GL_ARRAY_BUFFER, _radarLineVertexBuffer);
    glBufferData(GL_ARRAY_BUFFER, sizeof(radarLineVertices), radarLineVertices, GL_STATIC_DRAW);
    
    glEnableVertexAttribArray(GLKVertexAttribPosition);
    glVertexAttribPointer(GLKVertexAttribPosition, 3, GL_FLOAT, GL_FALSE, 0, 0);
    
    // Create and bind blip VAO and VBO
    glGenVertexArraysOES(1, &_blipVertexArray);
    glBindVertexArrayOES(_blipVertexArray);
    
    glGenBuffers(1, &_blipVertexBuffer);
    glBindBuffer(GL_ARRAY_BUFFER, _blipVertexBuffer);
    
    glEnableVertexAttribArray(GLKVertexAttribPosition);
    glVertexAttribPointer(GLKVertexAttribPosition, 3, GL_FLOAT, GL_FALSE, 0, 0);
    
    glBindVertexArrayOES(0);
}

- (void)setupShaders {
    // Radar shader
    const char *radarVertexShaderSource = 
        "uniform mat4 uMVPMatrix;"
        "attribute vec4 aPosition;"
        "varying vec3 vPosition;"
        "void main() {"
        "  gl_Position = uMVPMatrix * aPosition;"
        "  vPosition = aPosition.xyz;"
        "}";
    
    const char *radarFragmentShaderSource = 
        "precision mediump float;"
        "varying vec3 vPosition;"
        "void main() {"
        "  float dist = length(vPosition);"
        "  vec3 color = mix(vec3(0.1, 0.3, 0.4), vec3(0.3, 0.8, 0.8), dist * 2.0);"
        "  gl_FragColor = vec4(color, 0.8);"
        "}";
    
    GLuint radarVertexShader = [self compileShader:GL_VERTEX_SHADER source:radarVertexShaderSource];
    GLuint radarFragmentShader = [self compileShader:GL_FRAGMENT_SHADER source:radarFragmentShaderSource];
    
    _radarShaderProgram = glCreateProgram();
    glAttachShader(_radarShaderProgram, radarVertexShader);
    glAttachShader(_radarShaderProgram, radarFragmentShader);
    glLinkProgram(_radarShaderProgram);
    
    // Blip shader
    const char *blipVertexShaderSource = 
        "uniform mat4 uMVPMatrix;"
        "attribute vec4 aPosition;"
        "void main() {"
        "  gl_Position = uMVPMatrix * aPosition;"
        "  gl_PointSize = 20.0;"
        "}";
    
    const char *blipFragmentShaderSource = 
        "precision mediump float;"
        "void main() {"
        "  vec2 coord = gl_PointCoord - vec2(0.5);"
        "  float dist = length(coord);"
        "  if (dist > 0.5) discard;"
        "  float alpha = 1.0 - smoothstep(0.3, 0.5, dist);"
        "  gl_FragColor = vec4(1.0, 0.3, 0.3, alpha);"
        "}";
    
    GLuint blipVertexShader = [self compileShader:GL_VERTEX_SHADER source:blipVertexShaderSource];
    GLuint blipFragmentShader = [self compileShader:GL_FRAGMENT_SHADER source:blipFragmentShaderSource];
    
    _blipShaderProgram = glCreateProgram();
    glAttachShader(_blipShaderProgram, blipVertexShader);
    glAttachShader(_blipShaderProgram, blipFragmentShader);
    glLinkProgram(_blipShaderProgram);
    
    // Get uniform and attribute locations
    _mvpMatrixUniform = glGetUniformLocation(_radarShaderProgram, "uMVPMatrix");
    _positionAttribute = glGetAttribLocation(_radarShaderProgram, "aPosition");
}

- (GLuint)compileShader:(GLenum)type source:(const char *)source {
    GLuint shader = glCreateShader(type);
    glShaderSource(shader, 1, &source, NULL);
    glCompileShader(shader);
    
    GLint compileStatus;
    glGetShaderiv(shader, GL_COMPILE_STATUS, &compileStatus);
    if (compileStatus == GL_FALSE) {
        GLchar messages[256];
        glGetShaderInfoLog(shader, sizeof(messages), 0, &messages[0]);
        NSLog(@"Shader compile error: %s", messages);
        return 0;
    }
    
    return shader;
}

- (void)glkView:(GLKView *)view drawInRect:(CGRect)rect {
    CFTimeInterval currentTime = CACurrentMediaTime();
    if (_lastTime == 0) _lastTime = currentTime;
    CFTimeInterval deltaTime = currentTime - _lastTime;
    _lastTime = currentTime;
    
    // Update animations
    _rotationAngle += deltaTime * 30.0f * _rotationSpeed; // 30 degrees/second
    if (_pulseEnabled) {
        _pulseScale += deltaTime * _pulseDirection * 0.5f;
        if (_pulseScale > 1.2f || _pulseScale < 0.8f) {
            _pulseDirection *= -1;
        }
    }
    
    // Clear screen
    glClearColor(0.05f, 0.08f, 0.14f, 1.0f);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
    glEnable(GL_DEPTH_TEST);
    
    // Update model matrix
    _modelMatrix = GLKMatrix4Identity;
    _modelMatrix = GLKMatrix4RotateY(_modelMatrix, GLKMathDegreesToRadians(_rotationAngle));
    _modelMatrix = GLKMatrix4Scale(_modelMatrix, _pulseScale, 1.0f, _pulseScale);
    
    // Calculate MVP matrix
    _mvpMatrix = GLKMatrix4Multiply(GLKMatrix4Multiply(_projectionMatrix, _viewMatrix), _modelMatrix);
    
    // Draw radar base
    [self drawRadarBase];
    
    // Draw radar lines
    [self drawRadarLines];
    
    // Draw radar blips
    [self drawRadarBlips];
}

- (void)drawRadarBase {
    glUseProgram(_radarShaderProgram);
    
    glBindVertexArrayOES(_radarVertexArray);
    glUniformMatrix4fv(_mvpMatrixUniform, 1, GL_FALSE, _mvpMatrix.m);
    
    glDrawArrays(GL_TRIANGLE_FAN, 0, 361);
    glBindVertexArrayOES(0);
}

- (void)drawRadarLines {
    glUseProgram(_radarShaderProgram);
    
    glBindVertexArrayOES(_radarLineVertexArray);
    glUniformMatrix4fv(_mvpMatrixUniform, 1, GL_FALSE, _mvpMatrix.m);
    
    // Draw each ring
    for (int ring = 0; ring < 4; ring++) {
        glDrawArrays(GL_LINE_LOOP, ring * 360, 360);
    }
    glBindVertexArrayOES(0);
}

- (void)drawRadarBlips {
    glUseProgram(_blipShaderProgram);
    
    glBindVertexArrayOES(_blipVertexArray);
    glUniformMatrix4fv(glGetUniformLocation(_blipShaderProgram, "uMVPMatrix"), 1, GL_FALSE, _mvpMatrix.m);
    
    // Draw random blips
    for (int i = 0; i < 8; i++) {
        float angle = (float)(i * 45 * M_PI / 180.0);
        float distance = 0.3f + (float)(arc4random_uniform(100)) / 100.0f * 0.4f;
        float height = (float)(arc4random_uniform(100)) / 100.0f * 0.2f - 0.1f;
        
        GLfloat blipVertex[3] = {
            (GLfloat)(cos(angle) * distance), // X
            height,                           // Y
            (GLfloat)(sin(angle) * distance)  // Z
        };
        
        glBindBuffer(GL_ARRAY_BUFFER, _blipVertexBuffer);
        glBufferData(GL_ARRAY_BUFFER, sizeof(blipVertex), blipVertex, GL_DYNAMIC_DRAW);
        
        glDrawArrays(GL_POINTS, 0, 1);
    }
    glBindVertexArrayOES(0);
}

@end

@implementation Radar3DViewManager

RCT_EXPORT_MODULE(RTRadar3DGLView)

- (UIView *)view {
    return [[Radar3DView alloc] initWithFrame:CGRectZero];
}

RCT_EXPORT_VIEW_PROPERTY(rotationSpeed, float)
RCT_EXPORT_VIEW_PROPERTY(pulseEnabled, BOOL)

@end
